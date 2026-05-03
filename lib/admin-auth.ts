import { createHmac, timingSafeEqual } from "node:crypto";

import type { AdminJwtPayload } from "@/types/admin-auth";

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(`${padded}${padding}`, "base64").toString("utf8");
}

function sign(input: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(input)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function parseExpiresInSeconds(expiresInRaw: string | undefined): number {
  if (!expiresInRaw || expiresInRaw.trim() === "") {
    return 12 * 60 * 60;
  }

  const normalized = expiresInRaw.trim();
  const matched = normalized.match(/^(\d+)([smhd])$/i);
  if (!matched) {
    throw new Error("Invalid ADMIN_TOKEN_EXPIRES_IN format.");
  }

  const amount = Number.parseInt(matched[1], 10);
  const unit = matched[2].toLowerCase();

  if (amount <= 0) {
    throw new Error("ADMIN_TOKEN_EXPIRES_IN must be positive.");
  }

  if (unit === "s") {
    return amount;
  }
  if (unit === "m") {
    return amount * 60;
  }
  if (unit === "h") {
    return amount * 60 * 60;
  }
  return amount * 24 * 60 * 60;
}

export function createAdminJwt(
  secret: string,
  expiresInRaw: string | undefined,
): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const expiresInSeconds = parseExpiresInSeconds(expiresInRaw);
  const exp = now + expiresInSeconds;

  const header = { alg: "HS256", typ: "JWT" };
  const payload: AdminJwtPayload = {
    role: "admin",
    iat: now,
    exp,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const content = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(content, secret);

  return {
    token: `${content}.${signature}`,
    expiresAt: exp * 1000,
  };
}

export function verifyAdminJwt(
  token: string,
  secret: string,
): { valid: boolean; expiresAt?: number } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false };
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`, secret);

    const providedBuffer = Buffer.from(encodedSignature, "utf8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    if (providedBuffer.length !== expectedBuffer.length) {
      return { valid: false };
    }
    if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
      return { valid: false };
    }

    const parsedHeader = JSON.parse(base64UrlDecode(encodedHeader)) as {
      alg?: string;
      typ?: string;
    };
    if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") {
      return { valid: false };
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<AdminJwtPayload>;
    if (
      payload.role !== "admin" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return { valid: false };
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return { valid: false };
    }

    return { valid: true, expiresAt: payload.exp * 1000 };
  } catch {
    return { valid: false };
  }
}

