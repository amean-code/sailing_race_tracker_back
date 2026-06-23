import { NextResponse } from "next/server";
import { corsOptions, withCors } from "@/lib/api";
import { API_NAME, APP_NAME } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET() {
  let database: "connected" | "disconnected" = "disconnected";

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "connected";
  } catch {
    database = "disconnected";
  }

  return withCors(
    NextResponse.json({
      status: "ok",
      app: APP_NAME,
      api: API_NAME,
      database,
      version: process.env.npm_package_version ?? "0.1.0",
    }),
  );
}
