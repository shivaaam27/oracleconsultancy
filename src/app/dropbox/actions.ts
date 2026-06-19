"use server";

import { revalidatePath } from "next/cache";
import {
  getDropboxStatus, listFolders, setWatchedFolder, disconnectDropbox,
  type DropboxStatus, type DropboxFolder,
} from "@/lib/dropbox";
import { syncDropbox } from "@/lib/dropbox-sync";

export async function dropboxStatusAction(): Promise<DropboxStatus> {
  return getDropboxStatus();
}

export async function listDropboxFoldersAction(): Promise<DropboxFolder[]> {
  return listFolders();
}

export async function setDropboxFolderAction(path: string): Promise<{ ok: boolean }> {
  await setWatchedFolder(path);
  revalidatePath("/settings");
  return { ok: true };
}

export async function disconnectDropboxAction(): Promise<{ ok: boolean }> {
  await disconnectDropbox();
  revalidatePath("/settings");
  return { ok: true };
}

/** Pull new drops now (manual trigger / first connection). */
export async function syncDropboxNowAction(): Promise<{ ok: boolean; pulled: number; error?: string }> {
  const res = await syncDropbox();
  revalidatePath("/inbox");
  revalidatePath("/settings");
  return res;
}

/** Pull everything already sitting in the folder (the backlog), one time. */
export async function pullExistingDropboxAction(): Promise<{ ok: boolean; pulled: number; error?: string }> {
  const res = await syncDropbox({ pullExisting: true });
  revalidatePath("/inbox");
  revalidatePath("/settings");
  return res;
}
