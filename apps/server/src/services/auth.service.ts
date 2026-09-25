import { prisma } from "@repo/db/client";
import type { LoginDto, RegisterDto } from "@repo/types";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { AuthenticationError, ConflictError, NotFoundError } from "../lib/errors.js";

type UserRecord = {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SafeUser = Omit<UserRecord, "passwordHash">;

function omitHash(user: UserRecord): SafeUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

function signToken(payload: { userId: number; email: string }): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

export class AuthService {
  async register(dto: RegisterDto): Promise<{ user: SafeUser; token: string }> {
    const existing = await prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictError("Email is already registered.");
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash },
    });
    const token = signToken({ userId: user.id, email: user.email });
    return { user: omitHash(user), token };
  }

  async login(dto: LoginDto): Promise<{ user: SafeUser; token: string }> {
    const user = await prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new AuthenticationError("Invalid email or password.");
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new AuthenticationError("Invalid email or password.");
    }
    const token = signToken({ userId: user.id, email: user.email });
    return { user: omitHash(user), token };
  }

  async me(userId: number): Promise<SafeUser> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User");
    return omitHash(user);
  }
}

export const authService = new AuthService();
