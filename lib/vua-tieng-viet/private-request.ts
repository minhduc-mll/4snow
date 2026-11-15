import { adminPrivateSignal, getAdminToken } from "@/hooks/useAdminAuth";
import { privateDictionaryRequest, type PrivateRequest } from "./private-transport";

export function requestPrivateDictionary(request: PrivateRequest, signal: AbortSignal, unauthorized: () => void): Promise<unknown> {
  return privateDictionaryRequest(request, signal, { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, token: getAdminToken, signal: adminPrivateSignal, fetch, unauthorized });
}
