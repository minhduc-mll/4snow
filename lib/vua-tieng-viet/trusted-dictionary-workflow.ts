import { canonicalJson } from "./dictionary-contract.ts";
import type { ImportConflictLocation, ImportConflictReason, PreviewDependencies } from "./trusted-dictionary-types.ts";
export type WorkflowContext = { config: PreviewDependencies; cors: Record<string, string>; respond: (status: number, code: string, message: string, requestId?: string, extra?: Record<string, string>, reason?: ImportConflictReason, location?: ImportConflictLocation) => Response };
export async function editorialRequestHash(request: { operation: string; input: unknown }): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson({ operation: request.operation, input: request.input })));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
