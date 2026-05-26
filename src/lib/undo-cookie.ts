import { cookies } from "next/headers";

const COOKIE = "cos_undo";

export async function setUndoCookie(token: string, label: string) {
  const c = await cookies();
  c.set(COOKIE, `${token}|${label}`, {
    path: "/",
    maxAge: 60,
    httpOnly: false,
    sameSite: "lax",
  });
}
