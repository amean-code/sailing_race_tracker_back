import { NextResponse } from "next/server";
import { corsOptions, withCors } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST() {
  await clearSessionCookie();
  return withCors(NextResponse.json({ ok: true }));
}
