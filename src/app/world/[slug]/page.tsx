// src/app/world/[slug]/page.tsx
// A "World" browse screen — one of the 7 portfolio worlds. The slug is the
// canonical record: notFound() gates on it. force-dynamic because every figure is
// live. The root layout already supplies the centred max-w-[1100px] app container,
// and CommandWall (inside WorldScreen) centres the 880px column — so this returns
// the screen directly with no extra wrapper.
import { notFound } from "next/navigation";
import { getWorld } from "@/lib/worlds";
import { getWorldData } from "@/lib/world-data";
import { WorldScreen } from "@/components/world-screen";
import { getAppSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function WorldPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const world = getWorld(slug);
  if (!world) notFound();

  const data = await getWorldData(world.slug);
  // Tax & Legal paused → drop its page link from the world's "Inside" list.
  const { commandCentrePaused } = await getAppSettings();
  const shown = commandCentrePaused
    ? { ...world, pages: world.pages.filter((p) => p.href.split("?")[0] !== "/hrms/command-centre") }
    : world;
  return <WorldScreen world={shown} data={data} />;
}
