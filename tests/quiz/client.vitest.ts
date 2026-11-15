import { expect, test } from "vitest";
import { parseQuizIdentity, parseQuizReceipt, parsePlayerQuestions, type QuizSubmitRequest } from "../../lib/quiz/client";

const id = "11111111-1111-4111-8111-111111111111";
const request: QuizSubmitRequest = { operation: "submit", sessionId: id, questionId: id, requestId: id, selectedOptionIds: ["a"], credential: "a".repeat(64) };
const receipt = { id, session_id: id, question_id: id, request_id: id, selected_option_ids: ["a"], is_correct: false, time_remaining_ms: 100, score: 0, base_points: 1000, duration_seconds: 30, started_at: "2026-01-01T00:00:00Z", submitted_at: "2026-01-01T00:00:01Z" };

test("only correlated, bounded authoritative receipts can confirm an attempt", () => {
  expect(parseQuizReceipt(receipt, request).is_correct).toBe(false);
  expect(() => parseQuizReceipt({ ...receipt, request_id: "other" }, request)).toThrow();
  expect(() => parseQuizReceipt({ ...receipt, selected_option_ids: ["b"] }, request)).toThrow();
  expect(() => parseQuizReceipt({ ...receipt, time_remaining_ms: 999999 }, request)).toThrow();
  expect(() => parseQuizReceipt({ ...receipt, score: -1 }, request)).toThrow();
});
test("identity is tied to the joined session and requires a real credential", () => {
  expect(parseQuizIdentity({ sessionId: id, participantId: id, credential: request.credential }, id).sessionId).toBe(id);
  expect(() => parseQuizIdentity({ sessionId: "other", participantId: id, credential: request.credential }, id)).toThrow();
  expect(() => parseQuizIdentity({ sessionId: id, participantId: id, credential: "url-participant" }, id)).toThrow();
});
test("player question parsing keeps only public option fields and rejects ambiguous options", () => {
  const question = { id, session_id: id, prompt: "Question", type: "single_choice", time_limit_seconds: 30,
    options: [{ id: "a", label: "A", value: "Alpha", secret: true }, { id: "b", label: "B", value: "Beta" }], correct_option_ids: ["a"] };
  const parsed = parsePlayerQuestions([question]);
  expect(JSON.stringify(parsed)).not.toMatch(/secret|correct_option_ids/);
  expect(() => parsePlayerQuestions([{ ...question, options: [question.options[0], question.options[0]] }])).toThrow();
});
