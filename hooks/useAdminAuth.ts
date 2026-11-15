"use client";

import * as React from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

export const ADMIN_AUTH_TOKEN_KEY = "admin-auth-token";
type SessionState = { status: "checking" } | { status: "unauthenticated" } | { status: "authenticated"; expiresAt: number } | { status: "error"; message: string };
const serverState: SessionState = { status: "checking" };
let state: SessionState = serverState;
let generation = 0;
let token: string | null = null;
let started = false;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let privateController = new AbortController();
const listeners = new Set<() => void>();
const clients = new Set<QueryClient>();

function publish(next: SessionState): void { state = next; listeners.forEach((listener) => listener()); }
function readToken(): string | null { try { return window.localStorage.getItem(ADMIN_AUTH_TOKEN_KEY); } catch { return null; } }
function removeToken(): void { try { window.localStorage.removeItem(ADMIN_AUTH_TOKEN_KEY); } catch { /* Storage can be denied. */ } }
function clearPrivate(): void {
  privateController.abort();
  privateController = new AbortController();
  for (const client of clients) {
    void client.cancelQueries({ queryKey: ["vtv-private"] });
    client.removeQueries({ queryKey: ["vtv-private"] });
    const cache = client.getMutationCache();
    cache.findAll({ mutationKey: ["vtv-private"] }).forEach((mutation) => cache.remove(mutation));
  }
}
function invalidate(remove: boolean): void {
  generation++;
  token = null;
  if (expiryTimer) clearTimeout(expiryTimer);
  clearPrivate();
  if (remove) removeToken();
  publish({ status: "unauthenticated" });
}
function authenticate(value: string, expiresAt: number): void {
  token = value;
  publish({ status: "authenticated", expiresAt });
  const delay = Math.min(Math.max(expiresAt - Date.now(), 0), 2147483647);
  expiryTimer = setTimeout(() => { if (Date.now() >= expiresAt) logout(); else authenticate(value, expiresAt); }, delay);
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
async function refresh(): Promise<void> {
  const value = readToken();
  invalidate(false);
  if (!value) return;
  const current = generation;
  publish({ status: "checking" });
  try {
    const response = await fetch("/api/admin/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: value }) });
    const data: unknown = await response.json();
    if (current !== generation) return;
    if (readToken() !== value) { void refresh(); return; }
    if (response.ok && record(data) && data.valid === true && typeof data.expiresAt === "number" && Number.isFinite(data.expiresAt) && data.expiresAt > Date.now()) { authenticate(value, data.expiresAt); return; }
  } catch { if (current !== generation) return; }
  if (current === generation) invalidate(true);
}
function start(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("storage", (event) => { if (event.key === ADMIN_AUTH_TOKEN_KEY || event.key === null) void refresh(); });
  void refresh();
}
export function logout(): void { invalidate(true); }
export function getAdminToken(): string | null {
  if (state.status !== "authenticated" || !token) return null;
  if (state.expiresAt <= Date.now()) { invalidate(true); return null; }
  if (readToken() !== token) { void refresh(); return null; }
  return token;
}
export function adminSessionGeneration(): number { return generation; }
export function adminPrivateSignal(signal: AbortSignal): AbortSignal { return AbortSignal.any([signal, privateController.signal]); }
async function login(username: string, password: string, fallback: string): Promise<boolean> {
  invalidate(true);
  const current = generation;
  try {
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const data: unknown = await response.json();
    if (current !== generation) return false;
    if (!response.ok || !record(data) || typeof data.token !== "string" || !data.token || typeof data.expiresAt !== "number" || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) {
      publish({ status: "error", message: record(data) && typeof data.message === "string" ? data.message : fallback }); return false;
    }
    try { window.localStorage.setItem(ADMIN_AUTH_TOKEN_KEY, data.token); if (readToken() !== data.token) throw new Error("Storage unavailable"); } catch { removeToken(); publish({ status: "error", message: fallback }); return false; }
    authenticate(data.token, data.expiresAt);
    return true;
  } catch { if (current === generation) publish({ status: "error", message: fallback }); return false; }
}
export function useAdminSession() {
  const client = useQueryClient();
  const snapshot = React.useSyncExternalStore(React.useCallback((listener: () => void) => { listeners.add(listener); clients.add(client); start(); return () => { listeners.delete(listener); }; }, [client]), () => state, () => serverState);
  return { state: snapshot, login, logout };
}
export function useAdminAuthenticated(): boolean { return useAdminSession().state.status === "authenticated"; }
