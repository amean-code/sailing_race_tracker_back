import { NextRequest, NextResponse } from "next/server";
import {
  corsOptions,
  jsonError,
  jsonValidationError,
  withCors,
} from "@/lib/api";
import {
  createSessionToken,
  hashPassword,
  setSessionCookie,
  toPublicUser,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return withCors(jsonValidationError(parsed.error));
    }

    const { email, password, name, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return withCors(jsonError("Bu e-posta zaten kayıtlı", 409));
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name ?? null,
        role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
    await setSessionCookie(token);

    return withCors(
      NextResponse.json({ user: toPublicUser(user) }, { status: 201 }),
    );
  } catch {
    return withCors(jsonError("Kayıt işlemi başarısız", 500));
  }
}
