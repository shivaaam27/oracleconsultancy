"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * Browser Web Speech API typings (not in the default TS DOM lib).
 * Used for live captions while Whisper records, and as a full fallback
 * when audio recording / Whisper is unavailable.
 * ------------------------------------------------------------------ */
type SpeechRecognitionResult = { 0: { transcript: string }; isFinal: boolean };
type SpeechRecognitionEvent = {
  resultIndex: number;
  results: { length: number } & Record<number, SpeechRecognitionResult>;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Detach all handlers and force-stop a recogniser so it cannot fire stale callbacks. */
function killRecogniser(rec: SpeechRecognitionLike | null) {
  if (!rec) return;
  rec.onresult = null;
  rec.onerror = null;
  rec.onend = null;
  rec.onstart = null;
  try {
    rec.abort();
  } catch {
    /* already stopped */
  }
}

function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  /** Called with the transcribed text once recording is processed. */
  onResult: (text: string) => void;
  /** Live interim transcript (browser captions / fallback). */
  onInterim?: (text: string) => void;
  /** Fired once when dictation finishes (after transcription completes). */
  onStop?: () => void;
  disabled?: boolean;
  lang?: string;
  title?: string;
  className?: string;
};

type Phase = "idle" | "recording" | "transcribing";

/**
 * COS dictation control. Records real audio and transcribes it through Groq
 * Whisper (accurate, biased toward the personal dictionary). Shows a live level
 * meter, timer, and captions while recording, and a transcribing state after.
 * Falls back to the browser speech recogniser when recording/Whisper is off.
 *
 * Every session fully tears down its stream, recorder, recogniser, meter, and
 * timer, and reuses a single AudioContext, so dictation is repeatable.
 */
export function VoiceButton({ onResult, onInterim, onStop, disabled, lang, title, className }: Props) {
  const [available, setAvailable] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  // Always read the latest callbacks/lang from refs so memoised handlers never go stale.
  const cbRef = useRef({ onResult, onInterim, onStop, lang });
  cbRef.current = { onResult, onInterim, onStop, lang };

  // Recording plumbing.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startingRef = useRef(false);

  // Level-meter plumbing (AudioContext persists across sessions).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const barsRef = useRef<HTMLSpanElement[]>([]);

  // Recognisers: captions (parallel to Whisper) and fallback (standalone).
  const captionRecRef = useRef<SpeechRecognitionLike | null>(null);
  const fallbackRecRef = useRef<SpeechRecognitionLike | null>(null);
  const usingFallbackRef = useRef(false);

  /** Tear down everything for the current session. Safe to call repeatedly. */
  const teardownSession = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    killRecogniser(captionRecRef.current);
    captionRecRef.current = null;
    killRecogniser(fallbackRecRef.current);
    fallbackRecRef.current = null;

    try {
      sourceRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    sourceRef.current = null;

    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      try {
        if (recorderRef.current.state !== "inactive") recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    setAvailable(canRecord() || getRecognitionCtor() !== null);
    return () => {
      teardownSession();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close();
      }
      audioCtxRef.current = null;
    };
  }, [teardownSession]);

  /** Live captions: browser recogniser purely for instant display while Whisper records. */
  const startCaptions = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = cbRef.current.lang || (typeof navigator !== "undefined" ? navigator.language || "en-GB" : "en-GB");
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += `${r[0].transcript} `;
        else interim += r[0].transcript;
      }
      const live = `${finalText}${interim}`.trim();
      cbRef.current.onInterim?.(live);
    };
    rec.onerror = null;
    rec.onend = null;
    rec.onstart = null;
    captionRecRef.current = rec;
    try {
      rec.start();
    } catch {
      /* captions are optional; ignore start races */
    }
  }, []);

  const runMeter = useCallback((analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const level = Math.min(1, sum / data.length / 90);
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        const jitter = 0.4 + Math.abs(Math.sin(Date.now() / 120 + i)) * 0.6;
        const scale = 0.2 + level * jitter;
        bar.style.transform = `scaleY(${Math.max(0.15, scale)})`;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const finishRecording = useCallback(
    async (blob: Blob) => {
      setPhase("transcribing");
      // Stop the mic/meter/captions immediately; we only need the captured blob now.
      teardownSession();
      try {
        if (!blob || blob.size === 0) {
          setNote("Didn't catch any audio — try again.");
          return;
        }
        const fd = new FormData();
        const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
        fd.set("audio", blob, `dictation.${ext}`);
        if (cbRef.current.lang) fd.set("language", cbRef.current.lang);
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        const data = await res.json();
        const text = String(data?.text || "").trim();
        if (text) {
          cbRef.current.onResult(text);
        } else if (data?.source === "no-key") {
          setNote("Turn AI on in Settings to use voice.");
        } else {
          setNote("Could not transcribe — try again.");
        }
      } catch {
        setNote("Could not transcribe — try again.");
      } finally {
        setPhase("idle");
        setSeconds(0);
        cbRef.current.onStop?.();
      }
    },
    [teardownSession],
  );

  const startRecording = useCallback(async () => {
    usingFallbackRef.current = false;
    setNote(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNote("Microphone access was blocked.");
      startingRef.current = false;
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setNote("Recording isn't supported here.");
      startingRef.current = false;
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      void finishRecording(blob);
    };

    // Level meter — reuse one AudioContext.
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      runMeter(analyser);
    } catch {
      /* meter is cosmetic */
    }

    try {
      recorder.start();
    } catch {
      teardownSession();
      setNote("Could not start recording — try again.");
      startingRef.current = false;
      return;
    }
    startCaptions();
    setPhase("recording");
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    startingRef.current = false;
  }, [finishRecording, runMeter, startCaptions, teardownSession]);

  /* ---------------- Browser-speech-only fallback ---------------- */
  const startFallback = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      startingRef.current = false;
      return;
    }
    usingFallbackRef.current = true;
    setNote(null);
    const rec = new Ctor();
    rec.lang = cbRef.current.lang || (typeof navigator !== "undefined" ? navigator.language || "en-GB" : "en-GB");
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript;
        if (r.isFinal) {
          const trimmed = text.trim();
          if (trimmed) cbRef.current.onResult(trimmed);
        } else {
          interim += text;
        }
      }
      cbRef.current.onInterim?.(interim.trim());
    };
    rec.onerror = () => {};
    rec.onend = () => {
      fallbackRecRef.current = null;
      setPhase("idle");
      cbRef.current.onInterim?.("");
      cbRef.current.onStop?.();
    };
    rec.onstart = null;
    fallbackRecRef.current = rec;
    try {
      rec.start();
      setPhase("recording");
    } catch {
      setPhase("idle");
    }
    startingRef.current = false;
  }, []);

  const start = useCallback(() => {
    if (startingRef.current || phase !== "idle") return;
    startingRef.current = true;
    if (canRecord()) void startRecording();
    else startFallback();
  }, [phase, startRecording, startFallback]);

  const stop = useCallback(() => {
    if (usingFallbackRef.current) {
      // onend handler resets state and notifies the caller.
      try {
        fallbackRecRef.current?.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    // Stop captions now; let the recorder's onstop drive transcription.
    killRecogniser(captionRecRef.current);
    captionRecRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  if (!available) return null;

  // Transcribing.
  if (phase === "transcribing") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-bg-muted text-fg-muted text-xs font-medium",
          className,
        )}
      >
        <Loader2 size={13} className="animate-spin" />
        Transcribing…
      </span>
    );
  }

  // Recording: pill with live level meter + timer + stop. Live captions stream
  // into the host text field via onInterim, not a bubble.
  if (phase === "recording") {
    return (
      <button
        type="button"
        onClick={stop}
        title="Stop dictation"
        className={cn(
          "inline-flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-full bg-danger text-white text-xs font-medium",
          className,
        )}
      >
        {!usingFallbackRef.current && (
          <span className="flex items-end gap-0.5 h-3.5" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                ref={(el) => {
                  if (el) barsRef.current[i] = el;
                }}
                className="w-0.5 h-full origin-bottom rounded-full bg-white/90 transition-transform duration-75"
                style={{ transform: "scaleY(0.2)" }}
              />
            ))}
          </span>
        )}
        <Square size={11} className="fill-current" />
        <span className="tabular-nums">{fmtTime(seconds)}</span>
      </button>
    );
  }

  // Idle.
  return (
    <span className="inline-flex flex-col items-center">
      <button
        type="button"
        disabled={disabled}
        onClick={start}
        title={title ?? "Dictate"}
        className={cn(
          "inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors disabled:opacity-50",
          "text-fg-muted hover:text-accent hover:bg-bg-muted",
          className,
        )}
      >
        <Mic size={15} />
      </button>
      {note && <span className="mt-1 text-[10px] leading-tight text-fg-muted max-w-[10rem] text-center">{note}</span>}
    </span>
  );
}
