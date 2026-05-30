"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveAppSettings, type AppSettings, type SwipeAction } from "@/lib/settings";

const SWIPE_VALUES: SwipeAction[] = ["none", "complete", "escalate", "snooze", "archive", "delete", "open", "update"];
function swipe(fd: FormData, key: string): SwipeAction | undefined {
  const v = fd.get(key) as string | null;
  return v && SWIPE_VALUES.includes(v as SwipeAction) ? (v as SwipeAction) : undefined;
}

function num(fd: FormData, key: string): number | undefined {
  const v = fd.get(key);
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function saveSettings(fd: FormData): Promise<void> {
  const patch: Partial<AppSettings> = {
    dueSoonDays: num(fd, "dueSoonDays"),
    stalledDays: num(fd, "stalledDays"),
    agingDays: num(fd, "agingDays"),
    weatherCity: (fd.get("weatherCity") as string | null)?.trim() || undefined,
    weatherLat: num(fd, "weatherLat"),
    weatherLon: num(fd, "weatherLon"),
    aiEnabled: fd.get("aiEnabled") === "on",
    voiceLanguage: (fd.get("voiceLanguage") as string | null)?.trim() || undefined,
    voiceDictionary: (fd.get("voiceDictionary") as string | null)?.trim() || undefined,
    swipeRightAction: swipe(fd, "swipeRightAction"),
    swipeLeftAction: swipe(fd, "swipeLeftAction"),
    operatorName: ((fd.get("operatorName") as string | null) ?? "").trim(),
  };

  await saveAppSettings(patch);
  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
