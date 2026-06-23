import { NextRequest, NextResponse } from "next/server";
import {
  corsOptions,
  jsonError,
  jsonValidationError,
  withCors,
} from "@/lib/api";
import {
  createSessionToken,
  setSessionCookie,
  toPublicUser,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return withCors(jsonValidationError(parsed.error));
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return withCors(jsonError("E-posta veya şifre hatalı", 401));
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return withCors(jsonError("E-posta veya şifre hatalı", 401));
    }

    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
    await setSessionCookie(token);

    return withCors(
      NextResponse.json({
        user: toPublicUser({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
        }),
      }),
    );
  } catch {
    return withCors(jsonError("Giriş işlemi başarısız", 500));
  }
}
