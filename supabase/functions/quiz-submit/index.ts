declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

export {};

type JoinRequest = { operation: "join"; sessionId: string; displayName: string };
type SubmitRequest = {
  operation: "submit";
  sessionId: string;
  questionId: string;
  requestId: string;
  selectedOptionIds: string[];
  credential: string;
};
type QuizRequest = JoinRequest | SubmitRequest;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseRequest(value: unknown): QuizRequest | null {
  if (!isRecord(value) || typeof value.sessionId !== "string" || !uuid.test(value.sessionId)) return null;
  if (value.operation === "join" && Object.keys(value).sort().join(",") === "displayName,operation,sessionId" &&
      typeof value.displayName === "string" && value.displayName.trim().length > 0 && value.displayName.length <= 80) {
    return { operation: "join", sessionId: value.sessionId, displayName: value.displayName.trim() };
  }
  if (value.operation === "submit" && Object.keys(value).sort().join(",") === "credential,operation,questionId,requestId,selectedOptionIds,sessionId" &&
      typeof value.questionId === "string" && uuid.test(value.questionId) &&
      typeof value.requestId === "string" && uuid.test(value.requestId) &&
      typeof value.credential === "string" && /^[0-9a-f]{64}$/.test(value.credential) &&
      Array.isArray(value.selectedOptionIds) && value.selectedOptionIds.length >= 1 && value.selectedOptionIds.length <= 4 &&
      value.selectedOptionIds.every((item: unknown) => typeof item === "string" && item.length >= 1 && item.length <= 100) &&
      new Set(value.selectedOptionIds).size === value.selectedOptionIds.length) {
    return { operation: "submit", sessionId: value.sessionId, questionId: value.questionId, requestId: value.requestId,
      selectedOptionIds: value.selectedOptionIds, credential: value.credential };
  }
  return null;
}

async function readBounded(request: Request): Promise<string> {
  if (!request.body) throw new Error("empty");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) throw new Error("oversized");
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { await reader.cancel().catch(() => undefined); }
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const origins = (Deno.env.get("QUIZ_ALLOWED_ORIGINS") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" });
  if (origin && !origins.includes(origin)) return new Response(null, { status: 403, headers });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (request.method !== "POST") return reply(405, { error: "METHOD_NOT_ALLOWED" });
  let input: QuizRequest | null;
  try { input = parseRequest(JSON.parse(await readBounded(request))); }
  catch { return reply(400, { error: "INVALID_INPUT" }); }
  if (!input) return reply(400, { error: "INVALID_INPUT" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(503, { error: "UNAVAILABLE" });
  try {
    const credential = input.operation === "join"
      ? Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("")
      : input.credential;
    const body = input.operation === "join"
      ? { p_session_id: input.sessionId, p_name: input.displayName, p_credential: credential }
      : { p_session_id: input.sessionId, p_question_id: input.questionId, p_request_id: input.requestId,
          p_selected_option_ids: input.selectedOptionIds, p_credential: credential };
    const response = await fetch(`${url}/rest/v1/rpc/quiz_${input.operation}`, {
      method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result: unknown = await response.json();
    if (!response.ok || !isRecord(result)) return reply(503, { error: "UNAVAILABLE" });
    if (typeof result.error === "string") {
      const status = result.error === "UNAUTHORIZED" ? 401 : result.error === "RATE_LIMIT" ? 429 :
        ["RETRY_CONFLICT", "ALREADY_SUBMITTED", "QUESTION_INACTIVE", "QUESTION_EXPIRED", "SESSION_UNAVAILABLE"].includes(result.error) ? 409 : 400;
      return reply(status, { error: result.error });
    }
    return reply(200, input.operation === "join" ? { ...result, credential } : result);
  } catch { return reply(503, { error: "UNAVAILABLE" }); }
});
