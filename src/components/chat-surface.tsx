"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Image as ImageIcon,
  MessagesSquare,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { ChatMessage, ThreadDetail, ThreadSummary } from "@/lib/chat";
import type { MentionCandidate } from "@/lib/mentions";
import { segmentMentions } from "@/lib/mentions";
import { VoiceButton } from "@/components/voice-button";
import { useThreadChannel } from "@/components/chat-realtime";

export type ChatActions = {
  listMyThreads: () => Promise<ThreadSummary[]>;
  openThread: (
    id: number
  ) => Promise<{ ok: boolean; detail?: ThreadDetail | null; messages?: ChatMessage[]; error?: string }>;
  refreshThread: (
    id: number
  ) => Promise<{ ok: boolean; detail?: ThreadDetail | null; messages?: ChatMessage[]; error?: string }>;
  markThreadRead: (id: number) => Promise<{ ok: boolean }>;
  startDm: (personId: number) => Promise<{ ok: boolean; threadId?: number; error?: string }>;
  newGroup: (input: { title: string; personIds: number[] }) => Promise<{ ok: boolean; threadId?: number; error?: string }>;
  postMessage: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
  editChatMessage: (id: number, body: string) => Promise<{ ok: boolean }>;
  deleteChatMessage: (id: number) => Promise<{ ok: boolean }>;
  muteThread: (id: number, muted: boolean) => Promise<{ ok: boolean }>;
  signChatAttachment: (path: string) => Promise<{ url: string | null }>;
};

type Props = {
  me: string;
  meName: string;
  people: MentionCandidate[];
  canCreateGroup: boolean;
  ownerOption: boolean;
  initialThreadId: number | null;
  taskBase: "/task" | "/portal/task";
  voiceLang?: string;
  actions: ChatActions;
};

type DisplayMessage = ChatMessage & { pending?: boolean };

/* --------------------------- helpers --------------------------- */

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayKey(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
const AVATAR_GRADIENTS = [
  "from-[#5b8def] to-[#3b5bdb]",
  "from-[#22b8a6] to-[#0c9488]",
  "from-[#f0883e] to-[#e8590c]",
  "from-[#c069f0] to-[#8b3bdb]",
  "from-[#ef5b8d] to-[#d6336c]",
  "from-[#4dabf7] to-[#1971c2]",
  "from-[#69db7c] to-[#2f9e44]",
  "from-[#ffa94d] to-[#f08c00]",
];
function gradientFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
function isImage(type?: string): boolean {
  return !!type && type.startsWith("image/");
}

function Avatar({ name, group, size = 40 }: { name: string; group?: boolean; size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradientFor(name)} font-semibold text-white shadow-sm`}
    >
      {group ? <Users size={size * 0.45} /> : <span style={{ fontSize: size * 0.36 }}>{initials(name)}</span>}
    </span>
  );
}

/* --------------------------- main --------------------------- */

export function ChatSurface(props: Props) {
  const { me, meName, people, canCreateGroup, ownerOption, actions, taskBase, voiceLang } = props;
  const router = useRouter();
  const homeHref = taskBase.startsWith("/portal") ? "/portal" : "/";

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(props.initialThreadId);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<DisplayMessage[]>([]);
  const [filter, setFilter] = useState("");
  const [dialog, setDialog] = useState<null | "dm" | "group">(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const reloadList = useCallback(async () => {
    setThreads(await actions.listMyThreads());
  }, [actions]);

  // Initial open: marks the thread read (clears the badge).
  const reloadThread = useCallback(
    async (id: number) => {
      const res = await actions.openThread(id);
      if (res.ok) {
        setDetail(res.detail ?? null);
        setMessages(res.messages ?? []);
      }
    },
    [actions]
  );

  // Live refresh: read-only refetch (never marks read → no broadcast loop).
  const refresh = useCallback(
    async (id: number) => {
      const res = await actions.refreshThread(id);
      if (res.ok) {
        setDetail(res.detail ?? null);
        setMessages(res.messages ?? []);
      }
    },
    [actions]
  );

  useEffect(() => {
    reloadList();
  }, [reloadList]);
  useEffect(() => {
    setPending([]);
    if (selected != null) reloadThread(selected);
  }, [selected, reloadThread]);

  // A live event arrived. For "read" events we only refresh ticks (detail) and
  // must NOT mark read — that's what would ping-pong. For content events we
  // refresh and, since the thread is on screen, clear our own unread badge.
  const onRealtime = useCallback(
    (type: string) => {
      if (selected == null) {
        reloadList();
        return;
      }
      refresh(selected);
      reloadList();
      if (type !== "read") actions.markThreadRead(selected);
    },
    [selected, refresh, reloadList, actions]
  );

  const { typing, sendTyping } = useThreadChannel(selected, { onChange: onRealtime, meName });

  const display: DisplayMessage[] = [...messages, ...pending];

  // Stick to the bottom on new messages / typing.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [display.length, typing.length]);

  const send = useCallback(
    async (body: string, files: File[]): Promise<string | null> => {
      if (selected == null) return "No conversation.";
      const tempId = -Date.now();
      const optimistic: DisplayMessage = {
        id: tempId,
        threadId: selected,
        sender: me,
        senderName: meName,
        body,
        attachments: files.map((f) => ({ name: f.name, path: "", type: f.type, size: f.size })),
        taskCode: null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        pending: true,
      };
      setPending((p) => [...p, optimistic]);
      const fd = new FormData();
      fd.set("threadId", String(selected));
      fd.set("body", body);
      for (const f of files) fd.append("file", f);
      const res = await actions.postMessage(fd);
      if (res.ok) {
        await refresh(selected);
        setPending((p) => p.filter((m) => m.id !== tempId));
        reloadList();
        return null;
      }
      setPending((p) => p.filter((m) => m.id !== tempId));
      return res.error ?? "Could not send.";
    },
    [selected, me, meName, actions, refresh, reloadList]
  );

  const shown = threads.filter((t) => t.title.toLowerCase().includes(filter.toLowerCase()));
  const otherReaders = (detail?.participants ?? []).filter((p) => p.participant !== me);

  return (
    <div className="fixed inset-0 z-50 flex bg-bg md:static md:z-auto md:h-[calc(100dvh_-_13rem)] md:min-h-[420px] md:overflow-hidden md:rounded-[1.75rem] md:bg-bg-elev/70 md:shadow-pill md:ring-1 md:ring-border md:backdrop-blur-xl">
      {/* ---------------- Thread list ---------------- */}
      <aside
        className={`flex w-full flex-col border-border/60 md:w-[21rem] md:shrink-0 md:border-r ${
          selected != null ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="flex items-center gap-2 px-3 pb-3 pt-[max(1rem,env(safe-area-inset-top))] md:pt-4">
          <button
            type="button"
            onClick={() => router.push(homeHref)}
            className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-bg-muted hover:text-fg md:hidden"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="flex-1 text-[17px] font-bold tracking-tight md:text-base md:font-semibold">Messages</h2>
          {canCreateGroup && (
            <button
              type="button"
              onClick={() => setDialog("group")}
              title="New group"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <Users size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setDialog("dm")}
            title="New chat"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm transition-transform hover:scale-105 active:scale-95"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="px-3 pb-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search"
              className="w-full rounded-full bg-bg-subtle py-2.5 pl-9 pr-3 text-[15px] outline-none transition-shadow placeholder:text-fg-subtle focus:ring-2 ring-accent/30"
            />
          </div>
        </div>

        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {shown.length === 0 ? (
            <div className="px-3 py-14 text-center">
              <MessagesSquare size={30} className="mx-auto mb-2 text-fg-subtle/60" />
              <p className="text-[15px] text-fg-muted">No conversations yet.</p>
            </div>
          ) : (
            shown.map((t) => {
              const active = selected === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors ${
                    active ? "md:bg-accent-soft" : "active:bg-bg-subtle md:hover:bg-bg-subtle"
                  }`}
                >
                  <Avatar name={t.title} group={t.kind === "group"} size={50} />
                  <span className="min-w-0 flex-1 border-b border-border/40 pb-2.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[15px] ${t.unread > 0 ? "font-bold" : "font-semibold"}`}>
                        {t.title}
                      </span>
                      {t.lastMessageAt && (
                        <span className={`shrink-0 text-[12px] ${t.unread > 0 ? "font-semibold text-accent" : "text-fg-subtle"}`}>
                          {dayKey(t.lastMessageAt)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={`truncate text-[13px] ${t.unread > 0 ? "text-fg" : "text-fg-muted"}`}>
                        {t.preview ?? "Tap to start chatting"}
                      </span>
                      {t.unread > 0 && (
                        <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-fg">
                          {t.unread > 99 ? "99+" : t.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ---------------- Conversation ---------------- */}
      <section className={`relative flex flex-1 flex-col ${selected == null ? "hidden md:flex" : "flex"}`}>
        {selected == null ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
              <MessagesSquare size={28} />
            </span>
            <div>
              <p className="text-[15px] font-medium">Your messages</p>
              <p className="text-[15px] text-fg-muted">Pick a conversation or start a new one.</p>
            </div>
          </div>
        ) : (
          <>
            <header className="z-10 flex items-center gap-3 border-b border-border/60 bg-bg-elev/85 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-xl md:px-4 md:pt-2.5">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-bg-muted md:hidden"
                aria-label="Back"
              >
                <ArrowLeft size={20} />
              </button>
              <Avatar name={detail?.title ?? "?"} group={detail?.kind === "group"} size={40} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{detail?.title ?? "Conversation"}</p>
                <p className="truncate text-[12px] text-fg-muted">
                  {typing.length > 0
                    ? `${typing.join(", ")} ${typing.length === 1 ? "is" : "are"} typing…`
                    : detail?.kind === "group"
                      ? `${detail.participants.length} members`
                      : "Direct message"}
                </p>
              </div>
            </header>

            <div
              ref={scrollRef}
              className="relative flex-1 overflow-y-auto px-3 py-4 md:px-4"
              style={{
                backgroundImage:
                  "radial-gradient(hsl(var(--accent) / 0.05) 1px, transparent 1px), radial-gradient(hsl(var(--fg) / 0.025) 1px, transparent 1px)",
                backgroundSize: "22px 22px, 22px 22px",
                backgroundPosition: "0 0, 11px 11px",
              }}
            >
              <MessageList
                messages={display}
                me={me}
                isGroup={detail?.kind === "group"}
                otherReaders={otherReaders}
                typing={typing}
                people={people}
                taskBase={taskBase}
                signAttachment={actions.signChatAttachment}
                onEdit={async (id, body) => {
                  await actions.editChatMessage(id, body);
                  if (selected != null) reloadThread(selected);
                }}
                onDelete={async (id) => {
                  await actions.deleteChatMessage(id);
                  if (selected != null) reloadThread(selected);
                }}
              />
            </div>

            <Composer voiceLang={voiceLang} onSend={send} onTyping={sendTyping} />
          </>
        )}
      </section>

      {dialog && (
        <NewChatDialog
          mode={dialog}
          people={people.filter((p) => `person:${p.id}` !== me)}
          ownerOption={ownerOption}
          onClose={() => setDialog(null)}
          onPick={async (personId) => {
            const res = await actions.startDm(personId);
            setDialog(null);
            if (res.ok && res.threadId) {
              await reloadList();
              setSelected(res.threadId);
            }
          }}
          onGroup={async (title, ids) => {
            const res = await actions.newGroup({ title, personIds: ids });
            if (res.ok && res.threadId) {
              setDialog(null);
              await reloadList();
              setSelected(res.threadId);
            }
            return res.ok ? null : res.error ?? "Could not create the group.";
          }}
        />
      )}
    </div>
  );
}

/* --------------------------- messages --------------------------- */

const GROUP_GAP_MS = 5 * 60 * 1000;

type Reader = { participant: string; name: string; lastReadAt: string | null };

function MessageList({
  messages,
  me,
  isGroup,
  otherReaders,
  typing,
  people,
  taskBase,
  signAttachment,
  onEdit,
  onDelete,
}: {
  messages: DisplayMessage[];
  me: string;
  isGroup?: boolean;
  otherReaders: Reader[];
  typing: string[];
  people: MentionCandidate[];
  taskBase: "/task" | "/portal/task";
  signAttachment: (path: string) => Promise<{ url: string | null }>;
  onEdit: (id: number, body: string) => void;
  onDelete: (id: number) => void;
}) {
  if (messages.length === 0 && typing.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        <span className="text-3xl">👋</span>
        <p className="text-[15px] text-fg-muted">No messages yet — say hello.</p>
      </div>
    );
  }
  let lastDay = "";
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-0.5">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const day = dayKey(m.createdAt);
        const showDay = day !== lastDay;
        lastDay = day;
        const t = new Date(m.createdAt).getTime();
        const firstInGroup =
          showDay || !prev || prev.sender !== m.sender || t - new Date(prev.createdAt).getTime() > GROUP_GAP_MS;
        const lastInGroup =
          !next ||
          next.sender !== m.sender ||
          new Date(next.createdAt).getTime() - t > GROUP_GAP_MS ||
          dayKey(next.createdAt) !== day;
        const mine = m.sender === me;
        const seen =
          mine && !m.pending && otherReaders.length > 0
            ? otherReaders.every((r) => r.lastReadAt != null && r.lastReadAt >= m.createdAt)
            : false;
        return (
          <div key={m.id}>
            {showDay && (
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-bg-elev/80 px-3 py-1 text-[12px] font-semibold text-fg-muted shadow-sm ring-1 ring-border/60 backdrop-blur">
                  {day}
                </span>
              </div>
            )}
            <Bubble
              m={m}
              mine={mine}
              isGroup={isGroup}
              firstInGroup={firstInGroup}
              lastInGroup={lastInGroup}
              seen={seen}
              people={people}
              taskBase={taskBase}
              signAttachment={signAttachment}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        );
      })}
      {typing.length > 0 && <TypingBubble />}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-bg-elev px-4 py-3 shadow-sm ring-1 ring-border/70">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-subtle"
            style={{ animationDelay: `${i * 0.15}s`, animationDuration: "1s" }}
          />
        ))}
      </div>
    </div>
  );
}

function Bubble({
  m,
  mine,
  isGroup,
  firstInGroup,
  lastInGroup,
  seen,
  people,
  taskBase,
  signAttachment,
  onEdit,
  onDelete,
}: {
  m: DisplayMessage;
  mine: boolean;
  isGroup?: boolean;
  firstInGroup: boolean;
  lastInGroup: boolean;
  seen: boolean;
  people: MentionCandidate[];
  taskBase: "/task" | "/portal/task";
  signAttachment: (path: string) => Promise<{ url: string | null }>;
  onEdit: (id: number, body: string) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);

  if (m.deletedAt) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"} ${lastInGroup ? "mb-2.5" : "mb-0.5"}`}>
        <span className="rounded-2xl bg-bg-muted/50 px-3.5 py-2 text-[13px] italic text-fg-subtle ring-1 ring-border/50">
          🚫 This message was deleted
        </span>
      </div>
    );
  }

  const segs = segmentMentions(m.body, people);
  const showAvatar = !mine && isGroup;
  const images = m.attachments.filter((a) => isImage(a.type));
  const fileAttachments = m.attachments.filter((a) => !isImage(a.type));
  const radius = mine
    ? `rounded-2xl ${lastInGroup ? "rounded-br-md" : "rounded-br-2xl"}`
    : `rounded-2xl ${lastInGroup ? "rounded-bl-md" : "rounded-bl-2xl"}`;
  const hasText = m.body.trim().length > 0 || fileAttachments.length > 0 || !!m.taskCode || editing;

  return (
    <div className={`group flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${lastInGroup ? "mb-2.5" : "mb-0.5"}`}>
      {showAvatar && (lastInGroup ? <Avatar name={m.senderName} size={28} /> : <span className="w-7 shrink-0" />)}
      <div className={`flex max-w-[80%] flex-col ${mine ? "items-end" : "items-start"} ${m.pending ? "opacity-70" : ""}`}>
        {showAvatar && firstInGroup && (
          <span className="mb-0.5 ml-1 text-[12px] font-semibold text-fg-muted">{m.senderName}</span>
        )}

        {images.length > 0 && (
          <div className={`mb-0.5 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
            {images.map((a, i) => (
              <ImageThumb key={i} path={a.path} name={a.name} signAttachment={signAttachment} pending={m.pending} />
            ))}
          </div>
        )}

        {hasText && (
          <div
            className={`px-3.5 py-2 text-[15px] leading-relaxed shadow-sm ${radius} ${
              mine
                ? "bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent-hover))] text-accent-fg"
                : "bg-bg-elev text-fg ring-1 ring-border/70"
            }`}
          >
            {editing ? (
              <div className="flex flex-col gap-1.5">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg bg-black/10 px-2 py-1 text-[15px] text-inherit outline-none"
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onEdit(m.id, draft);
                      setEditing(false);
                    }}
                    className="rounded-md bg-white/25 px-2 py-0.5 text-[12px] font-medium"
                  >
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="px-2 py-0.5 text-[12px] opacity-80">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              m.body.trim().length > 0 && (
                <p className="whitespace-pre-wrap break-words">
                  {segs.map((s, i) =>
                    s.mention ? (
                      <span key={i} className={mine ? "font-semibold underline decoration-white/50" : "font-semibold text-accent"}>
                        {s.text}
                      </span>
                    ) : (
                      <span key={i}>{s.text}</span>
                    )
                  )}
                </p>
              )
            )}

            {fileAttachments.length > 0 && (
              <div className="mt-1.5 flex flex-col gap-1">
                {fileAttachments.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={m.pending}
                    onClick={async () => {
                      const { url } = await signAttachment(a.path);
                      if (url) window.open(url, "_blank");
                    }}
                    className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[13px] transition-colors ${
                      mine ? "bg-white/20 hover:bg-white/30" : "bg-bg-subtle hover:bg-bg-muted"
                    }`}
                  >
                    <Paperclip size={13} /> <span className="max-w-[14rem] truncate">{a.name}</span>
                  </button>
                ))}
              </div>
            )}

            {m.taskCode && (
              <Link
                href={`${taskBase}/${m.taskCode}`}
                className={`mt-1.5 inline-block rounded-lg px-2 py-0.5 text-[12px] font-semibold ${
                  mine ? "bg-white/20 hover:bg-white/30" : "bg-accent-soft text-accent hover:brightness-95"
                }`}
              >
                # {m.taskCode}
              </Link>
            )}
          </div>
        )}

        {lastInGroup && (
          <div className={`mt-1 flex items-center gap-1.5 px-1 ${mine ? "flex-row-reverse" : ""}`}>
            <span className="text-[11px] text-fg-subtle">
              {fmtTime(m.createdAt)}
              {m.editedAt ? " · edited" : ""}
            </span>
            {mine &&
              (m.pending ? (
                <Clock size={12} className="text-fg-subtle" />
              ) : seen ? (
                <CheckCheck size={14} className="text-info" />
              ) : (
                <Check size={14} className="text-fg-subtle" />
              ))}
            {mine && !editing && !m.pending && (
              <span className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button type="button" onClick={() => setEditing(true)} className="text-fg-subtle hover:text-fg">
                  <Pencil size={12} />
                </button>
                <button type="button" onClick={() => onDelete(m.id)} className="text-fg-subtle hover:text-danger">
                  <Trash2 size={12} />
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ImageThumb({
  path,
  name,
  signAttachment,
  pending,
}: {
  path: string;
  name: string;
  signAttachment: (path: string) => Promise<{ url: string | null }>;
  pending?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!path) return;
    signAttachment(path).then(({ url }) => {
      if (live) setUrl(url);
    });
    return () => {
      live = false;
    };
  }, [path, signAttachment]);

  if (!url) {
    return (
      <span className="flex h-44 w-44 items-center justify-center rounded-2xl bg-bg-muted text-fg-subtle">
        <ImageIcon size={22} className={pending ? "animate-pulse" : ""} />
      </span>
    );
  }
  return (
    <button type="button" onClick={() => window.open(url, "_blank")} className="block overflow-hidden rounded-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={name} className="max-h-64 max-w-[15rem] object-cover" />
    </button>
  );
}

/* --------------------------- composer --------------------------- */

function Composer({
  voiceLang,
  onSend,
  onTyping,
}: {
  voiceLang?: string;
  onSend: (body: string, files: File[]) => Promise<string | null>;
  onTyping: () => void;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const canSend = body.trim().length > 0 || files.length > 0;

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 132) + "px";
  }, [body]);

  async function submit() {
    if (sending || !canSend) return;
    setSending(true);
    setError(null);
    const text = body;
    const f = files;
    setBody("");
    setFiles([]);
    const err = await onSend(text, f);
    setSending(false);
    if (err) {
      setError(err);
      setBody(text);
      setFiles(f);
    }
  }

  return (
    <div className="border-t border-border/60 bg-bg-elev/85 px-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-xl md:px-3">
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5 px-1">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-bg-muted px-2.5 py-1 text-[12px]">
              {isImage(f.type) ? <ImageIcon size={12} /> : <Paperclip size={12} />}
              <span className="max-w-[12rem] truncate">{f.name}</span>
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-fg-muted hover:text-danger">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <p className="mb-1.5 px-2 text-[12px] text-danger">{error}</p>}
      <div className="flex items-end gap-1.5 rounded-[1.75rem] bg-bg-subtle px-1.5 py-1 transition-shadow focus-within:ring-2 ring-accent/30">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="Attach a file"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
        >
          <Paperclip size={19} />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])}
        />
        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            onTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Message"
          className="max-h-[132px] flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-fg-subtle"
        />
        <div className="pb-1">
          <VoiceButton lang={voiceLang} onResult={(text) => setBody((b) => (b ? `${b} ${text}` : text))} title="Dictate" />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={sending || !canSend}
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-accent-fg shadow-sm transition-all ${
            canSend
              ? "scale-100 bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent-hover))] hover:brightness-105 active:scale-95"
              : "scale-90 bg-transparent text-fg-subtle shadow-none"
          }`}
        >
          <Send size={18} className={canSend ? "-ml-0.5" : ""} />
        </button>
      </div>
    </div>
  );
}

/* --------------------------- new chat dialog --------------------------- */

function NewChatDialog({
  mode,
  people,
  ownerOption,
  onClose,
  onPick,
  onGroup,
}: {
  mode: "dm" | "group";
  people: MentionCandidate[];
  ownerOption: boolean;
  onClose: () => void;
  onPick: (personId: number) => void;
  onGroup: (title: string, ids: number[]) => Promise<string | null>;
}) {
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const pickedPeople = people.filter((p) => picked.includes(p.id));

  // Portal to <body>: the chat card's backdrop-blur makes it a containing
  // block for fixed children, which would clip/mis-centre the dialog.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-[1.75rem] bg-bg-elev shadow-pill ring-1 ring-border sm:rounded-[1.75rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <h2 className="text-[17px] font-semibold">{mode === "dm" ? "New chat" : "New group"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            <X size={18} />
          </button>
        </div>

        {mode === "group" && (
          <div className="px-5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Group name"
              className="w-full rounded-2xl bg-bg-subtle px-4 py-3 text-[15px] outline-none focus:ring-2 ring-accent/30"
            />
            {pickedPeople.length > 0 && (
              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                {pickedPeople.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPicked((cur) => cur.filter((x) => x !== p.id))}
                    className="flex shrink-0 flex-col items-center gap-1"
                    title={`Remove ${p.name}`}
                  >
                    <span className="relative">
                      <Avatar name={p.name} size={48} />
                      <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-fg text-bg ring-2 ring-bg-elev">
                        <X size={11} />
                      </span>
                    </span>
                    <span className="max-w-[3.5rem] truncate text-[11px] text-fg-muted">{p.name.split(/\s+/)[0]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-5 pb-2 pt-3">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people"
              className="w-full rounded-full bg-bg-subtle py-3 pl-9 pr-3 text-[15px] outline-none focus:ring-2 ring-accent/30"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
          {mode === "dm" && ownerOption && "owner".includes(q.toLowerCase()) && (
            <button
              type="button"
              onClick={() => onPick(0)}
              className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left text-[15px] hover:bg-bg-subtle"
            >
              <Avatar name="Owner" size={40} />
              <span className="font-medium">Owner</span>
            </button>
          )}
          {list.map((p) =>
            mode === "dm" ? (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left text-[15px] hover:bg-bg-subtle"
              >
                <Avatar name={p.name} size={40} />
                {p.name}
              </button>
            ) : (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  setPicked((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]))
                }
                className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left text-[15px] transition-colors ${
                  picked.includes(p.id) ? "bg-accent-soft" : "hover:bg-bg-subtle"
                }`}
              >
                <Avatar name={p.name} size={40} />
                <span className="flex-1">{p.name}</span>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                    picked.includes(p.id) ? "bg-accent text-accent-fg" : "ring-1 ring-border"
                  }`}
                >
                  {picked.includes(p.id) && <Check size={14} />}
                </span>
              </button>
            )
          )}
        </div>

        {mode === "group" && (
          <div className="border-t border-border/60 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {err && <p className="mb-2 text-[12px] text-danger">{err}</p>}
            <button
              type="button"
              disabled={!title.trim() || picked.length === 0 || busy}
              onClick={async () => {
                setBusy(true);
                const e = await onGroup(title, picked);
                setBusy(false);
                if (e) setErr(e);
              }}
              className="w-full rounded-2xl bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent-hover))] py-3 text-[15px] font-semibold text-accent-fg shadow-sm transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-40"
            >
              Create group{picked.length ? ` · ${picked.length}` : ""}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
