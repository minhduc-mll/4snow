import { NextResponse } from "next/server";

import { verifyAdminJwt } from "@/lib/admin-auth";
import type { AdminVerifyRequest, AdminVerifyResponse } from "@/types/admin-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AdminVerifyRequest>;
    const token = typeof body.token === "string" ? body.token : "";
    const secret = process.env.ADMIN_JWT_SECRET;

    if (!secret || !token) {
      return NextResponse.json({ valid: false } satisfies AdminVerifyResponse, {
        status: 200,
      });
    }

    const result = verifyAdminJwt(token, secret);
    if (!result.valid) {
      return NextResponse.json({ valid: false } satisfies AdminVerifyResponse, {
        status: 200,
      });
    }

    return NextResponse.json(
      { valid: true, expiresAt: result.expiresAt } satisfies AdminVerifyResponse,
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ valid: false } satisfies AdminVerifyResponse, {
      status: 200,
    });
  }
}

