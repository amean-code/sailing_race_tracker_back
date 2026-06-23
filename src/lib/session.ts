import { SignJWT, jwtVerify } from "jose";
import { AUTH_COOKIE, JWT_EXPIRY, type UserRole } from "@/lib/constants";

export type SessionPayload = {
  sub: string;
  email: string;
  role: UserRole;
  name: string | null;
};

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  payload: SessionPayload,
): Promise<string> {
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const sub = payload.sub;
    const email = payload.email;
    const role = payload.role;
    const name = payload.name;

    if (
      typeof sub !== "string" ||
      typeof email !== "string" ||
      typeof role !== "string"
    ) {
      return null;
    }

    return {
      sub,
      email,
      role: role as UserRole,
      name: typeof name === "string" ? name : null,
    };
  } catch {
    return null;
  }
}

export { AUTH_COOKIE };
