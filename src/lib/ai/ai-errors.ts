/**
 * Turns raw AI/command failure codes into plain-English, owner-friendly messages.
 * The command/ask routes return codes like "ai-413", "ai-429", "no-key",
 * "server-error", "bad-json" — never show those to the operator. Map them here.
 *
 * `retryable` tells the UI whether to offer a one-tap "Try again".
 */
export type FriendlyError = { message: string; retryable: boolean };

export function friendlyAIError(raw: string | null | undefined): FriendlyError {
  const code = (raw || "").toLowerCase().trim();

  // Groq HTTP statuses, surfaced as "ai-<status>".
  const groq = code.match(/^ai-(\d{3})$/);
  if (groq) {
    const status = Number(groq[1]);
    if (status === 429 || status === 413)
      return { message: "ORI is busy right now — give it a moment and try again.", retryable: true };
    if (status === 401 || status === 403)
      return { message: "ORI's AI key isn't working. Check the AI key in Settings.", retryable: false };
    if (status >= 500)
      return { message: "The AI service had a hiccup. Try again in a moment.", retryable: true };
    return { message: "ORI couldn't complete that. Try rephrasing, or try again.", retryable: true };
  }

  switch (code) {
    case "no-key":
    case "ai not configured":
      return { message: "AI is switched off. Turn it on in Settings to ask questions.", retryable: false };
    case "bad-json":
      return { message: "ORI didn't quite understand that. Try rephrasing it.", retryable: true };
    case "network error":
    case "network":
      return { message: "Couldn't reach the server — check your connection and try again.", retryable: true };
    case "server-error":
      return { message: "Something went wrong our end. Try again in a moment.", retryable: true };
    case "":
      return { message: "Something went wrong. Try again.", retryable: true };
    default:
      // An already-human message (e.g. "Task DS-007 not found") — pass through.
      return { message: raw as string, retryable: false };
  }
}
