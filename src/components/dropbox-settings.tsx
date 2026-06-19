"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderSync, Loader2, Plug, RefreshCw, Download, Unplug } from "lucide-react";
import { Button } from "@/components/ui";
import { Combobox } from "@/components/combobox";
import { useToast } from "@/components/toast";
import {
  listDropboxFoldersAction, setDropboxFolderAction, disconnectDropboxAction,
  syncDropboxNowAction, pullExistingDropboxAction,
} from "@/app/dropbox/actions";
import type { DropboxStatus, DropboxFolder } from "@/lib/dropbox";

export function DropboxSettings({ status }: { status: DropboxStatus }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [folders, setFolders] = useState<DropboxFolder[] | null>(null);
  const [loadingFolders, startFolders] = useTransition();

  if (!status.configured) {
    return (
      <p className="text-[12px] text-fg-muted leading-snug">
        Add <code className="rounded bg-bg-subtle px-1">DROPBOX_APP_KEY</code> and{" "}
        <code className="rounded bg-bg-subtle px-1">DROPBOX_APP_SECRET</code> in Vercel, redeploy, then a{" "}
        <b>Connect</b> button appears here.
      </p>
    );
  }

  if (!status.connected) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] text-fg-muted leading-snug">
          Connect your Dropbox so files you drop in your inbox folder pull in automatically for sorting. Read-only — nothing in Dropbox is ever changed.
        </p>
        <a href="/api/dropbox/auth"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg hover:bg-accent-hover btn-primary-rim">
          <Plug size={14} /> Connect Dropbox
        </a>
      </div>
    );
  }

  function loadFolders() {
    startFolders(async () => { setFolders(await listDropboxFoldersAction()); });
  }
  function pickFolder(name: string) {
    const f = (folders ?? []).find((x) => x.name === name || x.path === name);
    if (!f) return;
    start(async () => {
      await setDropboxFolderAction(f.path);
      toast(`Watching ${f.name}.`, { tone: "success" });
      router.refresh();
    });
  }
  function syncNow() {
    start(async () => {
      const r = await syncDropboxNowAction();
      toast(r.ok ? (r.pulled ? `Pulled ${r.pulled} file${r.pulled === 1 ? "" : "s"}.` : "Nothing new to pull.") : (r.error ?? "Sync failed."), { tone: r.ok ? "success" : "danger" });
      router.refresh();
    });
  }
  function pullExisting() {
    start(async () => {
      const r = await pullExistingDropboxAction();
      toast(r.ok ? `Pulled ${r.pulled} existing file${r.pulled === 1 ? "" : "s"}.` : (r.error ?? "Failed."), { tone: r.ok ? "success" : "danger" });
      router.refresh();
    });
  }
  function disconnect() {
    if (!window.confirm("Disconnect Dropbox? Files already pulled stay; new drops won't come in.")) return;
    start(async () => { await disconnectDropboxAction(); toast("Dropbox disconnected.", { tone: "default" }); router.refresh(); });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-success-soft text-success"><FolderSync size={14} /></span>
        <div className="min-w-0">
          <p className="font-medium leading-tight">Connected{status.account ? ` · ${status.account}` : ""}</p>
          <p className="text-[11px] text-fg-subtle">
            {status.folder != null ? `Watching: ${status.folder || "(whole Dropbox)"}` : "No folder chosen yet — pick one below."}
          </p>
        </div>
      </div>

      {/* Folder picker */}
      <div className="rounded-xl border border-border/70 bg-bg-subtle/30 p-3 space-y-2">
        <p className="text-[12px] font-medium">Watched folder</p>
        {folders === null ? (
          <Button type="button" variant="secondary" size="sm" loading={loadingFolders} onClick={loadFolders}>
            {loadingFolders ? null : <FolderSync size={13} />} Choose folder
          </Button>
        ) : (
          <Combobox
            name="dropboxFolder"
            options={folders.map((f) => f.name)}
            defaultValue={status.folder ?? ""}
            placeholder="Type to find a folder…"
            onCommit={pickFolder}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" loading={busy} onClick={syncNow}>
          {busy ? null : <RefreshCw size={13} />} Sync now
        </Button>
        <Button type="button" variant="secondary" size="sm" loading={busy} onClick={pullExisting}>
          {busy ? null : <Download size={13} />} Pull existing files
        </Button>
        <button type="button" onClick={disconnect} disabled={busy}
          className="ml-auto inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-danger transition disabled:opacity-50">
          <Unplug size={13} /> Disconnect
        </button>
      </div>

      <p className="text-[11px] text-fg-subtle leading-snug">
        Drop a file in the watched folder and it pulls in instantly for auto-sorting. One-way and read-only — your Dropbox files are never moved or deleted.
      </p>
    </div>
  );
}
