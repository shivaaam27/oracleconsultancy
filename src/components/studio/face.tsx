"use client";

/**
 * A person's face (Blobatar, MIT — blobatar.dev). Owner, 25 Sept 2026: give
 * each user an avatar by their role that reacts to their work, "always there,
 * and even in task rows they appear in that small circle and go away just
 * revealing the initials".
 *
 *  - Colour = role, expression = how their work looks now (lib/face-mood.ts,
 *    worked out by /api/faces — read ONCE per page load in the background, so
 *    nothing waits on it; until it lands a face is calm and neutral).
 *  - `peek` (task rows, small circles): the face shows for a moment, then fades
 *    to the initials; hovering brings it back.
 *  - Otherwise (People, a person's page): the face stays.
 *  - ALIVE (owner: "can't they be alive and reactive?"): a showing face
 *    breathes, bobs and blinks (`animate="always"`), and a new mood MORPHS into
 *    place rather than swapping. Faces 36px and up also watch the pointer
 *    (`useGaze`). A peek face animates only while it shows — a hidden one is a
 *    still picture, so a list of fifty rows is not fifty running animations.
 *  - Reduced motion (the OS setting or the portal's own toggle) = still faces.
 */
import { useEffect, useState } from "react";
import { Blobatar } from "@blobatar/react";
import { useGaze } from "@blobatar/react/gaze";
import "blobatar/motion.css";
import "blobatar/gaze.css";
import { idle, happy, sad, surprised, sleepy, unsure, love, sick, thinking } from "blobatar/expression";
import { faceKey, MOOD_WORDS, ROLE_HUE, type FaceMood, type FaceRole } from "@/lib/face-mood";
import { avatarTint, initials } from "@/components/studio/tasks/task-words";
import { cn } from "@/lib/cn";

type Faces = Record<string, [FaceRole, FaceMood]>;
const EXPRESSION = { idle, happy, sad, surprised, sleepy, unsure, love, sick, thinking } as const;
let cache: Faces | null = null;
let loading: Promise<Faces> | null = null;
const listeners = new Set<(f: Faces) => void>();

function loadFaces(): Promise<Faces> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = fetch("/api/faces", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { faces: {} }))
      .then((j: { faces?: Faces }) => {
        cache = j.faces ?? {};
        listeners.forEach((l) => l(cache!));
        // A face follows the work: look again in a few minutes.
        setTimeout(() => { cache = null; loading = null; }, 5 * 60_000);
        return cache;
      })
      .catch(() => { loading = null; return {} as Faces; });
  }
  return loading;
}

function useFace(name: string): { role: FaceRole; mood: FaceMood } | null {
  const [faces, setFaces] = useState<Faces | null>(cache);
  useEffect(() => {
    let live = true;
    const on = (f: Faces) => { if (live) setFaces(f); };
    listeners.add(on);
    void loadFaces().then(on);
    return () => { live = false; listeners.delete(on); };
  }, []);
  const hit = faces?.[faceKey(name)];
  return hit ? { role: hit[0], mood: hit[1] } : null;
}

/** Eyes follow the pointer only where there is one, and only on a face big enough to see it. */
const GAZE_MIN = 36;
const finePointer = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

type BlobProps = { name: string; size: number; role: FaceRole; mood: FaceMood; animate: boolean };

function Blob({ name, size, role, mood, animate }: BlobProps) {
  return (
    <Blobatar name={name} size={size} background="circle" hue={ROLE_HUE[role]} tone={role === "none" ? 0.25 : 0.55}
      expression={EXPRESSION[mood]} animate={animate ? "always" : undefined} />
  );
}

function GazingBlob(props: BlobProps) {
  const { ref } = useGaze({ travel: 3, lookAt: "pointer" });
  return (
    <Blobatar ref={ref} name={props.name} size={props.size} background="circle" hue={ROLE_HUE[props.role]}
      tone={props.role === "none" ? 0.25 : 0.55} expression={EXPRESSION[props.mood]} animate="always" />
  );
}

const reducedMotion = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced");

export function PersonFace({ name, size = 32, peek = false, ring = false, className }: {
  name: string;
  size?: number;
  /** Small circles in rows: the face shows, then fades to the initials. */
  peek?: boolean;
  /** A white ring, for faces that overlap in a stack. */
  ring?: boolean;
  className?: string;
}) {
  const face = useFace(name);
  const role = face?.role ?? "none";
  const mood = face?.mood ?? "idle";
  // Peek: visible for ~2.4s after the face arrives, then the initials.
  const [showFace, setShowFace] = useState(!peek);
  // Keyed on primitives: `face` is a fresh object every render, and depending
  // on it restarted the timer on every render, so in a busy list the faces
  // never faded — 241 of them animating at once on the task list.
  const known = face !== null;
  useEffect(() => {
    if (!peek || !known) return;
    setShowFace(true);
    if (reducedMotion()) { setShowFace(false); return; }
    const t = setTimeout(() => setShowFace(false), 2400);
    return () => clearTimeout(t);
  }, [peek, known, mood]);

  // Motion is decided after mount (the server has no window to ask).
  const [motion, setMotion] = useState<"none" | "alive" | "gaze">("none");
  useEffect(() => {
    if (reducedMotion()) return;
    setMotion(size >= GAZE_MIN && finePointer() ? "gaze" : "alive");
  }, [size]);

  const title = `${name}${face ? ` — ${MOOD_WORDS[mood]}` : ""}`;
  return (
    <span
      title={title}
      aria-label={title}
      role="img"
      onMouseEnter={peek ? () => setShowFace(true) : undefined}
      onMouseLeave={peek ? () => setShowFace(false) : undefined}
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full", ring && "ring-2 ring-[var(--st-surface)]", className)}
      style={{ width: size, height: size, background: avatarTint(name) }}
    >
      {/* The initials sit underneath; the face fades over them. */}
      <span aria-hidden className="font-semibold text-[#111214]" style={{ fontSize: Math.max(9, Math.round(size / 3.1)) }}>{initials(name)}</span>
      <span aria-hidden className={cn("absolute inset-0 transition-opacity duration-500", showFace ? "opacity-100" : "opacity-0")}>
        {motion === "gaze" && !peek
          ? <GazingBlob name={name} size={size} role={role} mood={mood} animate />
          : <Blob name={name} size={size} role={role} mood={mood} animate={motion !== "none" && showFace} />}
      </span>
    </span>
  );
}
