import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const APP_USER_SESSION_COOKIE = "app_user_session";
const TTL_SECONDS = 10 * 60;

interface AppUserSessionPayload {
  sub: string;
  email: string | null;
  device_id: string;
  exp: number;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sessionSecret(): string {
  const secret = process.env.APP_USER_SESSION_SECRET || process.env.APP_SESSION_TOKEN;
  if (!secret) {
    throw new Error("APP_USER_SESSION_SECRET or APP_SESSION_TOKEN is required");
  }
  return secret;
}

export function createAppUserSession(input: {
  sub: string;
  email: string | null;
  device_id: string;
}): string {
  const payload: AppUserSessionPayload = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", sessionSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function setAppUserSessionCookie(
  response: NextResponse,
  session: string,
): void {
  response.cookies.set({
    name: APP_USER_SESSION_COOKIE,
    value: session,
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export function clearAppUserSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: APP_USER_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
