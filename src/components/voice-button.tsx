"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/cn";

/* Minimal typings for the Web Speech API (not in the default TS DOM lib). */
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

type Props = {
  /** Called with each finalised chunk of dictated text (already trimmed, no trailing space). */
  onResult: (text: string) => void;
  /** Live interim transcript while speaking (not yet finalised). */
  onInterim?: (text: string) => void;
  /** Fired once when the user stops dictation (mic turned off / silence). */
  onStop?: () => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Microphone toggle that streams browser speech-recognition results back to the
 * caller. Renders nothing when the browser has no Web Speech API support, so the
 * surrounding UI stays clean on unsupported devices.
 */
export function VoiceButton({ onResult, onInterim, onStop, disabled, className }: Props) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
    return () => {
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = typeof navigator !== "undefined" ? navigator.language || "en-GB" : "en-GB";
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
      onInterim?.(interim.trim());
    };
    rec.onerror = () => {
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      onInterim?.("");
      onStop?.();
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [onResult, onInterim, onStop]);

  if (!supported) return null;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (listening ? stop() : start())}
      aria-pressed={listening}
      title={listening ? "Stop dictation" : "Dictate (speak your task)"}
      className={cn(
        "relative inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors disabled:opacity-50",
        listening
          ? "bg-danger text-white"
          : "text-fg-muted hover:text-accent hover:bg-bg-muted",
        className
      )}
    >
      {listening ? (
        <>
          <span className="absolute inset-0 rounded-full bg-danger/40 animate-ping" aria-hidden />
          <Square size={13} className="relative fill-current" />
        </>
      ) : (
        <Mic size={15} />
      )}
    </button>
  );
}
