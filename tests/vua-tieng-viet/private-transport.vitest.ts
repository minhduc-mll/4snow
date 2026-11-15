import { describe, expect, it, vi } from "vitest";
import { privateDictionaryRequest, PrivateRequestError, type PrivateTransportDependencies } from "../../lib/vua-tieng-viet/private-transport";

const request = { operation: "import-apply", requestId: "request-1", idempotencyKey: "key-1", input: {} };
function setup(handler: typeof fetch): PrivateTransportDependencies {
  return { url: "https://example.test", key: "anon", token: () => "token", signal: (signal) => signal, fetch: handler, unauthorized: vi.fn() };
}
function response(status: number, body: unknown): Response { return Response.json(body, { status }); }
function failure(status: number, code: string, extra: object = {}): Response { return response(status, { ok: false, requestId: request.requestId, error: { code, message: "failure", ...extra } }); }
const signal = () => new AbortController().signal;

describe("private dictionary transport", () => {
  it("sends credentials and returns a correlated result", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.headers).toEqual({ "Content-Type": "application/json", apikey: "anon", Authorization: "Bearer token" });
      expect(JSON.parse(String(init?.body))).toEqual(request);
      return response(200, { ok: true, requestId: request.requestId, data: { value: 1 } });
    });
    expect(await privateDictionaryRequest(request, signal(), setup(fetcher))).toEqual({ value: 1 });
  });
  it.each([
    [400, "INVALID_INPUT", "VALIDATION_FAILED"], [422, "VALIDATION_FAILED", "VALIDATION_FAILED"],
    [409, "REVISION_CONFLICT", "REVISION_CONFLICT"], [429, "RATE_LIMITED", "RATE_LIMITED"],
    [503, "TEMPORARILY_UNAVAILABLE", "UNAVAILABLE"],
  ])("classifies %s responses", async (status, code, kind) => {
    await expect(privateDictionaryRequest(request, signal(), setup(async () => failure(status, code)))).rejects.toMatchObject({ kind });
  });
  it("preserves conflict details", async () => {
    const details = { reason: "DUPLICATE_IDENTITY", location: { chunkIndex: 2, entryIndex: 3 } };
    await expect(privateDictionaryRequest(request, signal(), setup(async () => failure(409, "IMPORT_CONFLICT", details)))).rejects.toMatchObject({ kind: "IMPORT_CONFLICT", details });
  });
  it("handles unauthorized and unavailable storage without sending credentials", async () => {
    const deps = setup(async () => response(401, {}));
    await expect(privateDictionaryRequest(request, signal(), deps)).rejects.toMatchObject({ kind: "UNAUTHORIZED" });
    expect(deps.unauthorized).toHaveBeenCalledOnce();
    deps.token = () => null;
    deps.fetch = vi.fn();
    await expect(privateDictionaryRequest(request, signal(), deps)).rejects.toMatchObject({ kind: "UNAUTHORIZED" });
    expect(deps.fetch).not.toHaveBeenCalled();
    deps.url = undefined;
    await expect(privateDictionaryRequest(request, signal(), deps)).rejects.toMatchObject({ kind: "UNAVAILABLE" });
  });
  it.each([
    new Response("not json"), response(200, { ok: true, requestId: "other", data: {} }),
    response(200, { ok: true, requestId: request.requestId }), response(409, { ok: false, requestId: "other", error: { code: "REVISION_CONFLICT", message: "x" } }),
  ])("rejects malformed or unrelated envelopes", async (result) => {
    await expect(privateDictionaryRequest(request, signal(), setup(async () => result))).rejects.toMatchObject({ kind: "UNAVAILABLE" });
  });
  it("distinguishes cancellation and transport failure", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(privateDictionaryRequest(request, controller.signal, setup(async () => { throw Error(); }))).rejects.toMatchObject({ kind: "CANCELLED" });
    await expect(privateDictionaryRequest(request, signal(), setup(async () => { throw Error(); }))).rejects.toBeInstanceOf(PrivateRequestError);
    await expect(privateDictionaryRequest(request, signal(), setup(async () => { throw Error(); }))).rejects.toMatchObject({ kind: "UNAVAILABLE" });
  });
  it("discards a response that arrives after cancellation", async () => {
    const controller = new AbortController();
    const deps = setup(async () => {
      controller.abort();
      return response(200, { ok: true, requestId: request.requestId, data: "obsolete" });
    });
    await expect(privateDictionaryRequest(request, controller.signal, deps)).rejects.toMatchObject({ kind: "CANCELLED" });
  });
});
