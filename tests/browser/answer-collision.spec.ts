import { test, expect } from "@playwright/test";
test("administrator selects an exact collision meaning with conflict and lost-response recovery", async ({ page }) => {
  await page.route("**/api/admin/login", async (route) => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  const id = "30000000-0000-4000-8000-000000000001";
  const sourceId = "10000000-0000-4000-8000-000000000001";
  let approved = true;
  let selection: string | null = null;
  let attempts = 0;
  let retryKey: unknown = null;
  let cleared = false;
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (typeof body !== "object" || body === null || !("operation" in body) || !("requestId" in body)) throw new Error("Invalid request");
    const common = { ok: true, requestId: body.requestId };
    const current = { id: approved ? "40000000-0000-4000-8000-000000000002" : "40000000-0000-4000-8000-000000000001", revisionNumber: approved ? 2 : 1, original: "mèo", normalized: "MÈO", level: 3, definitionVi: "Một con vật.", review: approved ? "approved" : "pending", answerEligible: approved, category: approved ? "common" : null, rationale: approved ? "Đã kiểm tra nghĩa." : null, exclusionChecks: approved ? { names: true, abbreviations: true, offensive: true, malformed: true, unverified: true } : null };
    if (body.operation === "list") {
      return route.fulfill({ json: { ...common, data: { items: [{ id, sourceId, original: "mèo", normalized: "MÈO", level: 3, definitionVi: current.definitionVi, review: current.review, collision: false, revisionNumber: current.revisionNumber }], nextCursor: null, draftRevision: approved ? "1" : "0" } } });
    }
    if (body.operation === "detail") return route.fulfill({ json: { ...common, data: { id, sourceId, rightsReview: cleared ? { id, previousReviewId: null, decision: "cleared", evidence: "private evidence", obligations: "private obligations", createdAt: "2026-01-01T00:00:00Z", actorRole: "admin" } : null, attributionPreview: { id, sourceName: "Fixture", sourceEntryId: "synthetic", sourceSenseId: null, entryUrl: "https://example.invalid/entry", artifactUrl: "https://example.invalid/source", artifactSha256: "0".repeat(64), resourceRevision: "v1", artifactRevision: "artifact-v1", licenseName: "Synthetic", licenseVersion: null, licenseUrl: "https://example.invalid/license", attributionText: "Synthetic fixture", historyUrl: null, modificationsNotice: "Synthetic" }, entryUrl: "https://example.invalid/entry", sourceEntryId: "synthetic", sourceSenseId: null, sourceNotes: null, source: { name: "Fixture", artifactUrl: "https://example.invalid/source", artifactSha256: "0".repeat(64), resourceRevision: "v1", originDump: null, retrievedAt: "2026-01-01T00:00:00Z", rights: { licenseName: "Synthetic", licenseVersion: null, licenseUrl: "https://example.invalid/license", attributionText: "Synthetic fixture", historyUrl: null, redistributionNote: "Synthetic", modificationsNotice: "Synthetic" } }, current, draftRevision: approved ? "1" : "0", history: { items: [current], nextCursor: null } } } });
    if (body.operation === "rights-review") { cleared = true; return route.fulfill({ json: { ...common, data: { rightsReviewId: id, draftRevision: "2" } } }); }
    if (body.operation === "review") {
      if (!("input" in body) || typeof body.input !== "object" || body.input === null || !("exclusionChecks" in body.input)) throw new Error("Missing checks");
      expect(body.input.exclusionChecks).toEqual({ names: true, abbreviations: true, offensive: true, malformed: true, unverified: true });
      approved = true;
      return route.fulfill({ json: { ...common, data: { entryId: id, revisionNumber: 2, review: "approved", answerEligible: true, draftRevision: "1" } } });
    }
    if (body.operation === "collision") return route.fulfill({ json: { ...common, data: { items: [
      { entryId: id, revisionId: current.id, revisionNumber: 2, original: "mèo", definitionVi: "Một con vật.", review: "approved", eligible: true, sourceName: "Fixture", sourceEntryId: "one", sourceSenseId: "sense-1", entryUrl: "https://example.invalid/one" },
      { entryId: sourceId, revisionId: sourceId, revisionNumber: 3, original: "MÈO", definitionVi: "Nghĩa khác đã duyệt.", review: "approved", eligible: true, sourceName: "Other source", sourceEntryId: "two", sourceSenseId: "sense-2", entryUrl: "https://example.invalid/two" },
      { entryId: id, revisionId: id, revisionNumber: 1, original: "mèo", definitionVi: null, review: "pending", eligible: false, sourceName: "Pending source", sourceEntryId: "three", sourceSenseId: null, entryUrl: "https://example.invalid/three" }
    ], selectedRevisionId: selection, answerRevisionId: selection, unresolved: selection === null, eligibleCount: 2, nextCursor: null, draftRevision: String(attempts) } } });
    if (body.operation === "select-answer") {
      if (!("input" in body) || typeof body.input !== "object" || body.input === null || !("entryRevisionId" in body.input) || !("idempotencyKey" in body)) throw new Error("Invalid selection");
      expect(body.input.entryRevisionId).toBe(sourceId);
      attempts++;
      if (attempts === 1) return route.fulfill({ status: 409, json: { ok: false, requestId: body.requestId, error: { code: "REVISION_CONFLICT", message: "Revision conflict" } } });
      if (attempts === 2) { retryKey = body.idempotencyKey; selection = sourceId; return route.abort(); }
      expect(body.idempotencyKey).toBe(retryKey);
      return route.fulfill({ json: { ...common, data: { selection: { entryRevisionId: sourceId }, draftRevision: "2" } } });
    }
    throw new Error("Unexpected operation");
  });
  await page.goto("/admin#dictionary/review");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await page.getByRole("button", { name: /mèo · 3/i }).click();
  const panel = page.getByRole("region", { name: /Chọn nghĩa đáp án|Answer meaning selection/i });
  await expect(panel).toContainText("sense-2");
  await expect(panel).toContainText("Nghĩa khác đã duyệt.");
  await expect(panel.getByRole("button", { name: /Chưa đủ điều kiện|Not answer eligible/i })).toBeDisabled();
  const select = panel.getByRole("button", { name: /Chọn nghĩa này|Select this meaning/i }).nth(1);
  await select.click();
  await expect.poll(() => attempts).toBe(1);
  await expect(select).toBeEnabled();
  await select.click();
  await panel.getByRole("button", { name: /Thử lại an toàn|Retry safely/i }).click();
  await expect(panel.getByRole("button", { name: /Đáp án đã chọn|Selected answer/i })).toBeDisabled();
  await expect(panel).toContainText("Nghĩa khác đã duyệt.");
  await expect.poll(() => attempts).toBe(3);
  await page.getByRole("button", { name: /Đăng xuất|Log out/i }).click();
  await expect(panel).toHaveCount(0);
});
