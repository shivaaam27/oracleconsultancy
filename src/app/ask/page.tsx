"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { openAssistant } from "@/lib/assistant-bridge";

/**
 * Ask COS now lives in the floating assistant (no standalone page). Old links to
 * /ask redirect home and open the assistant full-screen.
 */
export default function AskRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
    const t = setTimeout(() => openAssistant(true), 80);
    return () => clearTimeout(t);
  }, [router]);
  return null;
}
