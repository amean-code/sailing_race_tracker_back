import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function jsonValidationError(error: ZodError) {
  const first = error.issues[0];
  return jsonError(first?.message ?? "Geçersiz istek", 400);
}

export function withCors(response: NextResponse): NextResponse {
  const origin = process.env.FRONTEND_URL ?? "http://localhost:5173";
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  return response;
}

export function corsOptions() {
  return withCors(new NextResponse(null, { status: 204 }));
}
