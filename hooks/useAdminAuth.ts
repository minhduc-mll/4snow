"use client";

import * as React from "react";

import type { AdminVerifyResponse } from "@/types/admin-auth";

export const ADMIN_AUTH_TOKEN_KEY = "admin-auth-token";
const ADMIN_AUTH_EVENT = "admin-auth-changed";

export function setAdminAuthToken(token: string): void {
  window.localStorage.setItem(ADMIN_AUTH_TOKEN_KEY, token);
  window.dispatchEvent(new Event(ADMIN_AUTH_EVENT));
}

export function clearAdminAuthToken(): void {
  window.localStorage.removeItem(ADMIN_AUTH_TOKEN_KEY);
  window.dispatchEvent(new Event(ADMIN_AUTH_EVENT));
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const response = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const data = (await response.json()) as AdminVerifyResponse;
    return data.valid;
  } catch {
    return false;
  }
}

export function useAdminAuthenticated(): boolean {
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  const refreshStatus = React.useCallback(async (): Promise<void> => {
    if (typeof window === "undefined") {
      setIsAuthenticated(false);
      return;
    }

    const token = window.localStorage.getItem(ADMIN_AUTH_TOKEN_KEY);
    if (!token) {
      setIsAuthenticated(false);
      return;
    }

    const valid = await verifyToken(token);
    if (!valid) {
      clearAdminAuthToken();
      setIsAuthenticated(false);
      return;
    }

    setIsAuthenticated(true);
  }, []);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshStatus();
    }, 0);

    const onStorage = (event: StorageEvent): void => {
      if (event.key === ADMIN_AUTH_TOKEN_KEY) {
        void refreshStatus();
      }
    };

    const onAuthChanged = (): void => {
      void refreshStatus();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(ADMIN_AUTH_EVENT, onAuthChanged);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ADMIN_AUTH_EVENT, onAuthChanged);
    };
  }, [refreshStatus]);

  return isAuthenticated;
}
