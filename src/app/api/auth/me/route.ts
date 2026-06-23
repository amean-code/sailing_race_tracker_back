import { NextResponse } from "next/server";
import { corsOptions, jsonError, withCors } from "@/lib/api";
import { getCurrentUser, toPublicUser } from "@/lib/auth";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return withCors(jsonError("Oturum bulunamadı", 401));
  }

  return withCors(NextResponse.json({ user: toPublicUser(user) }));
}
