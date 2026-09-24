import { describe, it, expect, vi, beforeEach } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
// Next's server runtime puts this on the global before its storages load.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
const { actionAsyncStorage } = await import("next/dist/server/app-render/action-async-storage.external");

vi.mock("server-only", () => ({}));
const state = { admin: false, portal: null as null | { id: number; name: string; portalRole: string; directorCompanyIds: number[] } };
vi.mock("@/lib/admin-auth", () => ({ isAdminSession: async () => state.admin }));
vi.mock("@/lib/settings", () => ({ getAppSettings: async () => ({ studioRoles: "director", studioPages: "tasks" }) }));
vi.mock("@/lib/portal-auth", () => ({
  getPortalPerson: async () => state.portal,
  companyScope: async () => [7],
  personCanSeeTask: async (_p: unknown, id: number) => id === 1,
}));

const { guardOwner, guardSignedIn, guardViewer, trusted, fromBrowser } = await import("./viewer");

/** Run like a browser-invoked server action (fetch OR plain form post). */
const asAction = <T,>(fn: () => Promise<T>) => actionAsyncStorage.run({ isAction: true } as never, fn);

beforeEach(() => { state.admin = false; state.portal = null; });

describe("action guards", () => {
  it("stand aside for server-side calls (MCP, cron, page render)", async () => {
    expect(fromBrowser()).toBe(false);
    await expect(guardOwner()).resolves.toBeUndefined();
  });

  it("refuse a browser action from someone who is not the owner", async () => {
    await expect(asAction(() => guardOwner())).rejects.toThrow(/administrator/);
    state.portal = { id: 5, name: "Staff", portalRole: "staff", directorCompanyIds: [] };
    await expect(asAction(() => guardOwner())).rejects.toThrow(/administrator/);
  });

  it("let the owner through", async () => {
    state.admin = true;
    await expect(asAction(() => guardOwner())).resolves.toBeUndefined();
  });

  it("trusted() marks a portal action's own call as server-side", async () => {
    await expect(asAction(() => trusted(() => guardOwner()))).resolves.toBeUndefined();
  });

  it("guardSignedIn accepts any portal person, refuses nobody", async () => {
    await expect(asAction(() => guardSignedIn())).rejects.toThrow(/Sign in/);
    state.portal = { id: 5, name: "Staff", portalRole: "staff", directorCompanyIds: [] };
    await expect(asAction(() => guardSignedIn())).resolves.toBeUndefined();
  });

  it("guardViewer: a director only on tasks inside their companies; staff never", async () => {
    state.portal = { id: 9, name: "Dir", portalRole: "director", directorCompanyIds: [7] };
    const v = await asAction(() => guardViewer({ taskId: 1 }));
    expect(v.kind).toBe("director");
    expect(v.actor).toBe("portal-dir:Dir");
    await expect(asAction(() => guardViewer({ taskId: 2 }))).rejects.toThrow(/companies/);
    state.portal = { id: 5, name: "Staff", portalRole: "staff", directorCompanyIds: [] };
    await expect(asAction(() => guardViewer({ taskId: 1 }))).rejects.toThrow(/Sign in/);
  });
});
