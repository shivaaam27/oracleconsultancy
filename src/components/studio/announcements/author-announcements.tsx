"use client";

/**
 * Announcements for a director or manager (26 Sept 2026) — the notices meant
 * for them, with Acknowledge, reactions and comments (the portal feed), and a
 * composer that posts to their own people (`portalCreateAnnouncement` keeps it
 * inside their companies / their team).
 */
import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, BigNumber, stBtn } from "@/components/studio/kit";
import { AnnouncementFeed } from "@/components/announcements/announcement-feed";
import type { FeedAnnouncement, AudienceKind } from "@/lib/messaging/announcements-shared";
import { AnnounceComposer, type ComposerLists } from "./announce-composer";

export function AuthorAnnouncements({ feed, lists, allowedKinds, reach }: { feed: FeedAnnouncement[]; lists: ComposerLists; allowedKinds: AudienceKind[]; reach: string }) {
  const [composing, setComposing] = useState(false);
  const [seed, setSeed] = useState("");
  const [ask, setAsk] = useState("");
  const waiting = feed.filter((a) => (a.requireAck ? !a.ackAt : !a.seenAt));
  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader title="Announcements" right={<button type="button" onClick={() => { setSeed(""); setComposing(true); }} className={stBtn.dark}><Plus size={15} />New announcement</button>} />
      <StudioCardRow>
        <StudioCard className="min-h-[190px]">
          <CardHead label="Waiting for you" right={<span>{feed.length} live</span>} />
          <div className="mt-auto pt-3">
            <BigNumber value={waiting.length} unit={waiting.length === 1 ? "notice" : "notices"} />
            <div className="mt-2 truncate text-[13px] text-[var(--st-on-card-muted)]">{waiting[0] ? waiting[0].title : "You are up to date."}</div>
          </div>
        </StudioCard>
        <StudioCard texture="rings" className="min-h-[190px]">
          <CardHead label="Write one with ORI" right={<span>it reaches {reach}</span>} />
          <form onSubmit={(e) => { e.preventDefault(); if (!ask.trim()) return; setSeed(ask); setComposing(true); setAsk(""); }}
            className="mt-auto flex h-11 items-center gap-2 rounded-xl border border-[#2E3035] bg-[#1F2023] pl-3.5 pr-1.5">
            <Sparkles size={15} className="shrink-0 text-[#8E9197]" />
            <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Say what your people should know"
              className="bare-field h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#F2F2F0] outline-none placeholder:text-[#8E9197]" />
            <button type="submit" disabled={!ask.trim()} className="h-8 shrink-0 rounded-[9px] bg-[#F2F2F0] px-3 text-xs font-semibold text-[#111214] disabled:opacity-40">Draft with AI</button>
          </form>
        </StudioCard>
      </StudioCardRow>
      <section className="st-desk st-panel min-w-0 rounded-[20px] bg-[var(--st-surface)] px-5 py-4">
        <AnnouncementFeed items={feed} />
      </section>
      <AnnounceComposer open={composing} onClose={() => setComposing(false)} mode="portal" lists={lists} allowedKinds={allowedKinds} seed={seed} />
    </StudioScope>
  );
}
