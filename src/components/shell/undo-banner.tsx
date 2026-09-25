"use client";
import { useEffect } from "react";
import { useToast } from "./toast";

const COOKIE = "cos_undo";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export async function callUndo(token: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return await res.json();
  } catch {
    return { ok: false, message: "Network error." };
  }
}

export function UndoBanner() {
  const { toast } = useToast();

  useEffect(() => {
    const raw = readCookie(COOKIE);
    if (!raw) return;
    clearCookie(COOKIE);

    // Cookie format: <token>|<label>
    const [token, label] = raw.split("|");
    if (!token) return;
    const summary = label || "Change saved.";

    toast(summary, {
      tone: "success",
      duration: 10000,
      action: {
        label: "Undo",
        onClick: async () => {
          const r = await callUndo(token);
          toast(r.message, { tone: r.ok ? "success" : "warn", duration: 3000 });
          if (r.ok && typeof window !== "undefined") {
            window.location.reload();
          }
        },
      },
    });
  }, [toast]);

  return null;
}
