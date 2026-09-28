import { config } from "../config.ts";

const KEY = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(config.jwtSecret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);

const b64u = (b: ArrayBuffer | Uint8Array): string => {
  const buf = b instanceof Uint8Array ? Buffer.from(b.buffer, b.byteOffset, b.byteLength) : Buffer.from(b);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64d = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export interface JwtPayload { sub: number; jti: string; exp: number; }

export async function signJWT(sub: number, expSec: number): Promise<string> {
  const jti = crypto.randomUUID();
  const h = b64u(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const p = b64u(new TextEncoder().encode(JSON.stringify({ sub, jti, exp: Math.floor(Date.now() / 1000) + expSec })));
  const sig = b64u(await crypto.subtle.sign("HMAC", KEY, new TextEncoder().encode(`${h}.${p}`)));
  return `${h}.${p}.${sig}`;
}

export async function verifyJWT(token: string): Promise<JwtPayload | null> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const ok = await crypto.subtle.verify("HMAC", KEY, b64d(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64d(p))) as JwtPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch { return null; }
}
