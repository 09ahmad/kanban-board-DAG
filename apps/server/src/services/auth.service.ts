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
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
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

  /**
   * Extend a session that has not lapsed yet.
   *
   * There is no refresh token, so this is not rotation and there is no
   * revocation story: it trades that for a session that does not expire while
   * someone is actually using the board. The current token has to still be
   * valid, which is the point — a lapsed session has to sign in again, and this
   * endpoint is not a way around that.
   *
   * The user is re-read rather than trusted from the token, so a session cannot
   * outlive the account it belongs to.
   */
  async refresh(userId: number): Promise<{ user: SafeUser; token: string }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AuthenticationError("This account no longer exists.");
    }
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
