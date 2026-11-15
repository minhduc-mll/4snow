import type { QuizOption, QuizSessionStatus, QuestionType } from "../../types/database";

export type QuizIdentity = { sessionId: string; participantId: string; credential: string };
export type QuizSubmitRequest = { operation: "submit"; sessionId: string; questionId: string; requestId: string; selectedOptionIds: string[]; credential: string };
export type QuizReceipt = {
  id: string; session_id: string; question_id: string; request_id: string;
  selected_option_ids: string[]; is_correct: boolean; time_remaining_ms: number; score: number;
  base_points: number; duration_seconds: number; started_at: string; submitted_at: string;
};
export type PlayerQuestion = { id: string; session_id: string; prompt: string; type: QuestionType; options: QuizOption[]; time_limit_seconds: number };
export type PlayerSession = { id: string; title: string; status: QuizSessionStatus; current_question_id: string | null; current_question_started_at: string | null; question_index: number; total_questions: number };
export type QuizRanking = { id: string; session_id: string; display_name: string; score: number };
export type QuizFailure = "UNAVAILABLE" | "UNAUTHORIZED" | "RATE_LIMIT" | "INVALID_INPUT" | "INVALID_OPTION" | "RETRY_CONFLICT" | "ALREADY_SUBMITTED" | "QUESTION_INACTIVE" | "QUESTION_EXPIRED" | "SESSION_UNAVAILABLE";
export class QuizRequestError extends Error {
  constructor(readonly code: QuizFailure) { super(code); }
  get retryable() { return this.code === "UNAVAILABLE" || this.code === "RATE_LIMIT"; }
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export const isQuizId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
function invalid(): never { throw new QuizRequestError("UNAVAILABLE"); }

export function parseQuizIdentity(value: unknown, sessionId: string): QuizIdentity {
  if (!record(value) || value.sessionId !== sessionId || !isQuizId(value.participantId) || typeof value.credential !== "string" || !/^[0-9a-f]{64}$/.test(value.credential)) invalid();
  return { sessionId, participantId: value.participantId, credential: value.credential };
}
export function parseQuizReceipt(value: unknown, request: QuizSubmitRequest): QuizReceipt {
  if (!record(value) || !isQuizId(value.id) || value.session_id !== request.sessionId || value.question_id !== request.questionId || value.request_id !== request.requestId ||
      !Array.isArray(value.selected_option_ids) || value.selected_option_ids.length !== request.selectedOptionIds.length || !value.selected_option_ids.every((item: unknown, index: number) => item === request.selectedOptionIds[index]) ||
      typeof value.is_correct !== "boolean" || !integer(value.time_remaining_ms) || !integer(value.score) || !integer(value.base_points) || !integer(value.duration_seconds) ||
      value.duration_seconds < 1 || value.time_remaining_ms > value.duration_seconds * 1000 || value.score > value.base_points || !timestamp(value.started_at) || !timestamp(value.submitted_at)) invalid();
  return { id: value.id, session_id: request.sessionId, question_id: request.questionId, request_id: request.requestId, selected_option_ids: [...request.selectedOptionIds],
    is_correct: value.is_correct, time_remaining_ms: value.time_remaining_ms, score: value.score, base_points: value.base_points, duration_seconds: value.duration_seconds, started_at: value.started_at, submitted_at: value.submitted_at };
}
export function parsePlayerSession(value: unknown): PlayerSession {
  if (!record(value) || !isQuizId(value.id) || typeof value.title !== "string" ||
      (value.status !== "draft" && value.status !== "lobby" && value.status !== "active" && value.status !== "paused" && value.status !== "completed") ||
      (value.current_question_id !== null && !isQuizId(value.current_question_id)) || (value.current_question_started_at !== null && !timestamp(value.current_question_started_at)) ||
      !integer(value.question_index) || !integer(value.total_questions)) invalid();
  return { id: value.id, title: value.title, status: value.status, current_question_id: value.current_question_id, current_question_started_at: value.current_question_started_at, question_index: value.question_index, total_questions: value.total_questions };
}
export function parsePlayerQuestions(value: unknown): PlayerQuestion[] {
  if (!Array.isArray(value) || value.length > 1) invalid();
  return value.map((item: unknown): PlayerQuestion => {
    if (!record(item) || !isQuizId(item.id) || !isQuizId(item.session_id) || typeof item.prompt !== "string" ||
        (item.type !== "single_choice" && item.type !== "multiple_choice" && item.type !== "true_false") || !integer(item.time_limit_seconds) || item.time_limit_seconds < 1 || item.time_limit_seconds > 3600 ||
        !Array.isArray(item.options) || item.options.length < 2 || item.options.length > 4) invalid();
    const options = item.options.map((option: unknown): QuizOption => {
      if (!record(option) || typeof option.id !== "string" || typeof option.label !== "string" || typeof option.value !== "string") invalid();
      return { id: option.id, label: option.label, value: option.value };
    });
    if (new Set(options.map(option => option.id)).size !== options.length) invalid();
    return { id: item.id, session_id: item.session_id, prompt: item.prompt, type: item.type, time_limit_seconds: item.time_limit_seconds, options };
  });
}
export function parseQuizRankings(value: unknown): QuizRanking[] {
  if (!Array.isArray(value) || value.length > 100) invalid();
  return value.map((item: unknown): QuizRanking => {
    if (!record(item) || !isQuizId(item.id) || !isQuizId(item.session_id) || typeof item.display_name !== "string" || !integer(item.score)) invalid();
    return { id: item.id, session_id: item.session_id, display_name: item.display_name, score: item.score };
  });
}

export async function quizRequest(body: { operation: "join"; sessionId: string; displayName: string } | QuizSubmitRequest, signal: AbortSignal): Promise<unknown> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) invalid();
    const response = await fetch(`${url}/functions/v1/quiz-submit`, { method: "POST", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const value: unknown = await response.json();
    if (!response.ok) {
      if (record(value)) {
        const code = value.error;
        if (code === "UNAUTHORIZED" || code === "RATE_LIMIT" || code === "INVALID_INPUT" || code === "INVALID_OPTION" || code === "RETRY_CONFLICT" || code === "ALREADY_SUBMITTED" || code === "QUESTION_INACTIVE" || code === "QUESTION_EXPIRED" || code === "SESSION_UNAVAILABLE") throw new QuizRequestError(code);
      }
      invalid();
    }
    return value;
  } catch (error) {
    if (signal.aborted) throw error;
    throw error instanceof QuizRequestError ? error : new QuizRequestError("UNAVAILABLE");
  }
}
