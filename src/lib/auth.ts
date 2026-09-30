import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Guard for write/admin routes. Clients send the shared secret in `x-admin-secret`.
 * - ADMIN_SECRET set: header must match.
 * - ADMIN_SECRET unset: allowed in development only; denied in production (secure default).
 * Returns a NextResponse to short-circuit with, or null when the request may proceed.
 */
export function requireAdmin(req: Request): NextResponse | null {
  return checkSecret(req, "ADMIN_SECRET", "x-admin-secret");
}

/** Guard for scheduled jobs (`Authorization: Bearer <CRON_SECRET>`, as Vercel Cron sends). */
export function requireCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "production" ? deny(503, "CRON_SECRET is not configured.") : null;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return safeEqual(got, secret) ? null : deny(401, "Unauthorized.");
}

function checkSecret(req: Request, envName: string, header: string): NextResponse | null {
  const secret = process.env[envName];
  if (!secret) {
    return process.env.NODE_ENV === "production" ? deny(403, `${envName} is not configured; write access is disabled.`) : null;
  }
  return safeEqual(req.headers.get(header) ?? "", secret) ? null : deny(401, "Missing or invalid admin secret.");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function deny(status: number, error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}
