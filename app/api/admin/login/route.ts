import { NextResponse } from "next/server";

import { createAdminJwt } from "@/lib/admin-auth";
import type {
  AdminLoginErrorResponse,
  AdminLoginRequest,
  AdminLoginSuccessResponse,
} from "@/types/admin-auth";

function badRequest(message: string): NextResponse<AdminLoginErrorResponse> {
  return NextResponse.json(
    { error: "UNKNOWN_ERROR", message },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AdminLoginRequest>;
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      return badRequest("Invalid login request.");
    }

    const envUsername = process.env.ADMIN_USERNAME;
    const envPassword = process.env.ADMIN_PASSWORD;
    const jwtSecret = process.env.ADMIN_JWT_SECRET;
    const expiresInRaw = process.env.ADMIN_TOKEN_EXPIRES_IN;

    if (!envUsername || !envPassword || !jwtSecret) {
      return NextResponse.json(
        {
          error: "AUTH_CONFIG_MISSING",
          message: "Admin authentication is not configured.",
        } satisfies AdminLoginErrorResponse,
        { status: 500 },
      );
    }

    if (username !== envUsername || password !== envPassword) {
      return NextResponse.json(
        {
          error: "INVALID_CREDENTIALS",
          message: "Invalid username or password.",
        } satisfies AdminLoginErrorResponse,
        { status: 401 },
      );
    }

    const { token, expiresAt } = createAdminJwt(jwtSecret, expiresInRaw);

    return NextResponse.json(
      { token, expiresAt } satisfies AdminLoginSuccessResponse,
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        error: "UNKNOWN_ERROR",
        message: "Unable to complete login.",
      } satisfies AdminLoginErrorResponse,
      { status: 500 },
    );
  }
}

