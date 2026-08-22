"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Sparkles, Play } from "lucide-react";
import { Panel } from "@/components/surface-kit";

/* Profile control to replay the welcome walkthrough and re-watch past feature
 * spotlights. Each button forgets the person's completion (server action),
 * leaves a sessionStorage breadcrumb so the tour shows again even if completed
 * this session, then navigates to the tour's host page where the mounted
 * TourRunner picks it up. router.refresh() re-runs the layout so the now-unseen
 * tour is back in its props. */

type TourLite = { key: string; title: string | null; body: string | null; route: string };

export function TourReplay({
  welcome,
  spotlights,
  restart,
}: {
  welcome: TourLite | null;
  spotlights: TourLite[];
  restart: (key: string) => Promise<{ route: string } | null>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const replay = (key: string) =>
    start(async () => {
      sessionStorage.setItem("cos:replayTour", key);
      const res = await restart(key);
      if (res?.route) {
        // The mounted TourRunner reads the breadcrumb on arrival and launches
        // the tour imperatively — no refresh needed (refresh races the push).
        router.push(res.route);
      } else {
        sessionStorage.removeItem("cos:replayTour");
      }
    });

  return (
    <Panel className="divide-y divide-border/60 p-0">
      {welcome && (
        <button
          type="button"
          disabled={pending}
          onClick={() => replay(welcome.key)}
          className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-bg-subtle/50 disabled:opacity-60"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <RotateCcw size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Replay the welcome tour</span>
            <span className="block text-xs text-fg-subtle">A quick guided walk through your portal.</span>
          </span>
          <Play size={15} className="shrink-0 text-fg-subtle" />
        </button>
      )}

      {spotlights.length > 0 && (
        <div className="p-4">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">
            <Sparkles size={13} /> What&apos;s new
          </div>
          <ul className="flex flex-col gap-1.5">
            {spotlights.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => replay(s.key)}
                  className="flex w-full items-center gap-3 rounded-xl bg-bg-subtle/50 px-3 py-2.5 text-left transition-colors hover:bg-bg-muted disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{s.title ?? "New feature"}</span>
                    {s.body && <span className="block text-xs text-fg-subtle truncate">{s.body}</span>}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-accent">Watch</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
