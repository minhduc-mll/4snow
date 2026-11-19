import { test, expect } from "@playwright/test";
import { parseBulkRequest, type BulkDecision, type BulkItemResult } from "../../lib/vua-tieng-viet/bulk-review-contract";

for (const reload of [false, true]) test(`an administrator resumes a lost bulk response ${reload ? "after reload" : "in the same tab"}`, async ({ page }) => {
  await page.route("**/api/admin/login", (route) => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  await page.route("**/api/admin/verify", (route) => route.fulfill({ json: { valid: true, expiresAt: Date.now() + 60000 } }));
  const sourceId = "10000000-0000-4000-8000-000000000001";
  const selectionId = "20000000-0000-4000-8000-000000000001";
  const rows = Array.from({ length: 101 }, (_, i) => ({
    entryId: `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, expectedEntryRevision: 1,
    original: i === 100 ? "vui" : "mèo", definitionVi: "Nghĩa thử nghiệm.", level: 3,
    blocker: i === 100 ? "source-rights" : null, answerBlocker: null, meaningWarning: false, result: null,
  }));
  let checkpoint = 0;
  let applied = 0;
  let failed = 0;
  let firstKey: string | null = null;
  let firstInput: unknown;
  let savedDecision: BulkDecision | null = null;
  let applyAttempts = 0;
  let secondBatchKey: string | null = null;
  let draftRevision = "0";
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (!body || typeof body !== "object" || !("operation" in body) || !("requestId" in body)) throw new Error("Invalid request");
    const reply = (data: unknown) => route.fulfill({ json: { ok: true, requestId: body.requestId, data } });
    if (body.operation === "list") return reply({ draftRevision, nextCursor: null, items: rows.slice(0, 50).map((row) => ({
      id: row.entryId, sourceId, original: row.original, normalized: row.original.toUpperCase(), level: row.level,
      definitionVi: row.definitionVi, review: "pending", collision: false, revisionNumber: 1,
    })) });
    if (body.operation === "bulk-create" || body.operation === "bulk-page") {
      const request = parseBulkRequest(body);
      if (request.operation === "bulk-create") expect(request.input.targets).toBeNull();
      const offset = request.operation === "bulk-page" ? request.input.offset : 0;
      return reply({
        selectionId, selectionHash: "a".repeat(64), offset, count: rows.length, checkpoint, draftRevision,
        distribution: { 3: 101, 5: 0, 7: 0, 9: 0 }, totals: { applied, unchanged: 0, conflict: 0, invalid: failed },
        items: rows.slice(offset, offset + 100), decision: savedDecision,
      });
    }
    const request = parseBulkRequest(body);
    if (request.operation !== "bulk-apply") throw new Error("Unexpected operation");
    applyAttempts++;
    const { offset, targets, batchId } = request.input;
    expect(targets.map((target) => target.entryId)).toEqual(rows.slice(offset, offset + 100).map((row) => row.entryId));
    if (applyAttempts === 1) {
      firstKey = request.idempotencyKey;
      firstInput = request.input;
      const { category, answerEligible, rationale, exclusionChecks } = request.input;
      savedDecision = { category, answerEligible, rationale, exclusionChecks };
      checkpoint = 100;
      applied = 100;
      draftRevision = "1";
      return route.fulfill({ status: 503 });
    }
    if (offset === 0) {
      expect(request.idempotencyKey).toBe(firstKey);
      expect(request.input).toEqual(firstInput);
    } else {
      expect(request.input.expectedDraftRevision).toBe("1");
      if (secondBatchKey === null) {
        secondBatchKey = request.idempotencyKey;
        return route.fulfill({ status: 429, headers: { "Retry-After": "1", "Access-Control-Expose-Headers": "Retry-After" }, json: { ok: false, requestId: body.requestId, error: { code: "RATE_LIMITED", message: "Quota reached" } } });
      }
      expect(request.idempotencyKey).toBe(secondBatchKey);
      checkpoint = 101;
      failed = 1;
      draftRevision = "2";
    }
    const items: BulkItemResult[] = targets.map(({ entryId }) => ({ entryId, status: offset === 0 ? "applied" : "invalid", reason: offset === 0 ? null : "source-rights" }));
    return reply({ batchId, draftRevision, checkpoint, items });
  });

  await page.goto("/admin#dictionary/review");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await page.getByRole("button", { name: /Xem lại toàn bộ kết quả lọc|Review all filtered rows/i }).click();
  const panel = page.getByRole("region", { name: /Duyệt nhóm mục từ|Bulk candidate review/i });
  await expect(panel.getByText(/Đã cố định 101 mục từ|Frozen selection of 101 candidates/i)).toBeVisible();
  await panel.getByRole("button", { name: /Trang tiếp|Next/i }).click();
  await panel.getByText(/Kiểm tra mục 101|Inspect candidates 101/i).click();
  await expect(panel.getByText(/Nguồn cần được duyệt quyền|Source rights need clearance/i)).toBeVisible();
  await panel.getByRole("button", { name: /Trang trước|Previous page/i }).click();
  await expect(panel.getByText(/Kiểm tra mục 1–100|Inspect candidates 1–100/i)).toBeVisible();
  await panel.getByLabel(/Lý do|Rationale/i).fill("Đã rà nhóm trong fixture.");
  for (const label of [/tên riêng|proper name/i, /chữ viết tắt|abbreviation/i, /xúc phạm|offensive/i, /sai cấu trúc|malformed/i, /chưa kiểm chứng|unverified generated/i]) {
    await panel.getByLabel(label).check();
  }
  await panel.getByRole("button", { name: /Xác nhận quyết định cho vùng chọn|Confirm decision for this selection/i }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  if (reload) await page.reload();
  await panel.getByRole("button", { name: /Tiếp tục quyết định đã xác nhận|Resume confirmed decision/i }).click();
  await expect(panel.getByText(/Đã xử lý 101\/101|Processed 101 of 101/i)).toBeVisible();
  expect(applyAttempts).toBe(reload ? 3 : 4);
});
