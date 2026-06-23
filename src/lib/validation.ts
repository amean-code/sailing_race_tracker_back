import { z } from "zod";
import { USER_ROLES } from "@/lib/constants";

export const registerSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
  password: z.string().min(8, "Şifre en az 8 karakter olmalı"),
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(USER_ROLES).default("SAILOR"),
});

export const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
  password: z.string().min(1, "Şifre gerekli"),
});
