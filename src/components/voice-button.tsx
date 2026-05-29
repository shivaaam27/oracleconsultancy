"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * Browser Web Speech fallback (used only when audio recording / Groq
 * Whisper is unavailable, e.g. AI is switched off or no MediaRecorder).
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
  /** Live interim transcript — only emitted by the browser-speech fallback. */
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
 * meter and timer while recording, and a transcribing state afterwards. Falls
 * back to the browser speech recogniser when recording or Whisper is unavailable.
 */
export function VoiceButton({ onResult, onInterim, onStop, disabled, lang, title, className }: Props) {
  const [available, setAvailable] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [caption, setCaption] = useState("");

  // Recording plumbing.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Level-meter plumbing.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const barsRef = useRef<HTMLSpanElement[]>([]);

  // Browser-speech fallback.
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const usingFallbackRef = useRef(false);

  // Parallel recogniser used only for live captions while Whisper records.
  const captionRecRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setAvailable(canRecord() || getRecognitionCtor() !== null);
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    timerRef.current = null;
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    recorderRef.current = null;
    recRef.current?.abort();
    recRef.current = null;
    captionRecRef.current?.abort();
    captionRecRef.current = null;
    setCaption("");
  }, []);

  // Live captions: run the browser recogniser purely for instant on-screen text
  // while Whisper records the authoritative audio. Its results are display-only.
  const startCaptions = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang || (typeof navigator !== "undefined" ? navigator.language || "en-GB" : "en-GB");
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
      setCaption(live);
      onInterim?.(live);
    };
    rec.onerror = () => {};
    rec.onend = () => {};
    captionRecRef.current = rec;
    try {
      rec.start();
    } catch {
      /* captions are optional */
    }
  }, [lang, onInterim]);

  const runMeter = useCallback((analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const level = Math.min(1, sum / data.length / 90); // 0..1, gently amplified
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
      try {
        const fd = new FormData();
        const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
        fd.set("audio", blob, `dictation.${ext}`);
        if (lang) fd.set("language", lang);
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        const data = await res.json();
        const text = String(data?.text || "").trim();
        if (text) {
          onResult(text);
        } else if (data?.source === "no-key") {
          setNote("Turn AI on in Settings to use voice.");
        } else {
          setNote("Could not transcribe — try again.");
        }
      } catch {
        setNote("Could not transcribe — try again.");
      } finally {
        cleanup();
        setPhase("idle");
        setSeconds(0);
        onStop?.();
      }
    },
    [lang, onResult, onStop, cleanup],
  );

  const startRecording = useCallback(async () => {
    setNote(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNote("Microphone access was blocked.");
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      void finishRecording(blob);
    };

    // Level meter.
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      runMeter(analyser);
    } catch {
      /* meter is cosmetic; ignore failures */
    }

    recorder.start();
    startCaptions();
    setPhase("recording");
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }, [finishRecording, runMeter, startCaptions]);

  /* ---------------- Browser-speech fallback ---------------- */
  const startFallback = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    usingFallbackRef.current = true;
    setNote(null);
    const rec = new Ctor();
    rec.lang = lang || (typeof navigator !== "undefined" ? navigator.language || "en-GB" : "en-GB");
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript;
        if (r.isFinal) {
          const trimmed = text.trim();
          if (trimmed) onResult(trimmed);
        } else {
          interim += text;
        }
      }
      setCaption(interim.trim());
      onInterim?.(interim.trim());
    };
    rec.onerror = () => setPhase("idle");
    rec.onend = () => {
      setPhase("idle");
      recRef.current = null;
      onInterim?.("");
      onStop?.();
    };
    recRef.current = rec;
    try {
      rec.start();
      setPhase("recording");
    } catch {
      setPhase("idle");
    }
  }, [lang, onResult, onInterim, onStop]);

  const start = useCallback(() => {
    if (canRecord()) void startRecording();
    else startFallback();
  }, [startRecording, startFallback]);

  const stop = useCallback(() => {
    if (usingFallbackRef.current) {
      recRef.current?.stop();
      return;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  if (!available) return null;

  // Transcribing: show a spinner pill.
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

  // Recording: expanded pill with live level meter + timer + stop, plus a live
  // caption bubble above when speech is detected.
  if (phase === "recording") {
    return (
      <span className={cn("relative inline-flex", className)}>
        {caption && (
          <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 z-50 w-max max-w-[min(20rem,70vw)] rounded-lg bg-fg px-2.5 py-1.5 text-[11px] leading-snug text-bg shadow-lg">
            {caption}
          </span>
        )}
        <button
          type="button"
          onClick={stop}
          title="Stop dictation"
          className="inline-flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-full bg-danger text-white text-xs font-medium"
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
      </span>
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
