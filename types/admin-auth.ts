export type AdminAuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "AUTH_CONFIG_MISSING"
  | "UNKNOWN_ERROR";

export interface AdminLoginRequest {
  username: string;
  password: string;
}

export interface AdminLoginSuccessResponse {
  token: string;
  expiresAt: number;
}

export interface AdminLoginErrorResponse {
  error: AdminAuthErrorCode;
  message: string;
}

export interface AdminVerifyRequest {
  token: string;
}

export interface AdminVerifyResponse {
  valid: boolean;
  expiresAt?: number;
}

export interface AdminJwtPayload {
  role: "admin";
  iat: number;
  exp: number;
}

