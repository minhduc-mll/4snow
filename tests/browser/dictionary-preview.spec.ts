import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalJson } from "../../lib/vua-tieng-viet/dictionary-contract";

test("blocks malformed JSON and incomplete part sets before contacting the server", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route("**/api/admin/login", route => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  let previewCalls = 0;
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (typeof body === "object" && body !== null && "operation" in body && body.operation === "import-preview") previewCalls++;
    await route.fulfill({ status: 503 });
  });
  await page.goto("/admin#dictionary/import");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  const input = page.locator("#dictionary-preview-file");
  const begin = page.getByRole("button", { name: /Bắt đầu hoặc tiếp tục|Start or resume/i });
  await input.setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{\n  "entries": [') });
  await expect(page.getByText(/invalid\.json.*(?:Dòng 2|Line 2).*JSON/i)).toBeVisible();
  await expect(begin).toBeDisabled();
  await page.getByRole("combobox", { name: /Ngôn ngữ|Language/i }).selectOption("en");
  await expect(page.getByText(/invalid\.json.*Line 2.*Invalid JSON syntax/i)).toBeVisible();
  const fixture: unknown = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
  if (typeof fixture !== "object" || fixture === null) throw new Error("Invalid fixture");
  await input.setInputFiles({ name: "part-1.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...fixture, chunkCount: 2 })) });
  await expect(page.getByText(/Còn thiếu 1 phần|Missing 1 parts/i)).toBeVisible();
  await expect(begin).toBeDisabled();
  expect(previewCalls).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("administrator previews a chunk and logout clears the preview", async ({ page }) => {
  await page.route("**/api/admin/login", async (route) => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (typeof body !== "object" || body === null || !("requestId" in body)) throw new Error("Missing request ID");
    if ("operation" in body && body.operation === "list") return route.fulfill({ json: { ok: true, requestId: body.requestId, data: { items: [], nextCursor: null, draftRevision: "0" } } });
    await route.fulfill({ json: { ok: true, requestId: body.requestId, data: { valid: true, entryCount: 1, collisionCount: 0, duplicateCount: 0, conflictCount: 0, canonicalHash: "0".repeat(64), errors: [], errorsTruncated: false } } });
  });
  await page.goto("/admin#dictionary");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  const file: unknown = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
  if (typeof file !== "object" || file === null || !("entries" in file) || !Array.isArray(file.entries)) throw new Error("Invalid fixture");
  const first: unknown = file.entries[0];
  if (typeof first !== "object" || first === null) throw new Error("Invalid candidate");
  file.entries.push({ ...first, externalId: "synthetic-2", original: "tiếng Việt" });
  await page.locator("#dictionary-preview-file").setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.getByRole("region", { name: /Kiểm tra trên trình duyệt|Browser preview/i })).toContainText(/Trùng cách viết: 1|Spelling collisions: 1/i);
  await expect(page.getByRole("heading", { name: /Kiểm tra tin cậy|Trusted preview/i })).toBeVisible();
  await page.getByRole("button", { name: /Đăng xuất|Log out/i }).click();
  await expect(page.locator("#dictionary-preview-file")).toHaveCount(0);
});

test("an unauthorized trusted preview signs out and clears the file", async ({ page }) => {
  await page.route("**/api/admin/login", async (route) => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (typeof body === "object" && body !== null && "operation" in body && body.operation === "list" && "requestId" in body) return route.fulfill({ json: { ok: true, requestId: body.requestId, data: { items: [], nextCursor: null, draftRevision: "0" } } });
    return route.fulfill({ status: 401, json: { ok: false } });
  });
  await page.goto("/admin#dictionary");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await page.locator("#dictionary-preview-file").setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json") });
  await expect(page.locator("#dictionary-preview-file")).toHaveCount(0);
  await expect(page.getByLabel(/Tài khoản|Username/i)).toBeVisible();
});

test("logout from another tab clears the current preview", async ({ page }) => {
  await page.route("**/api/admin/login", async (route) => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async (route) => route.fulfill({ status: 503 }));
  await page.goto("/admin#dictionary");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await expect(page.locator("#dictionary-preview-file")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "admin-auth-token", newValue: null })));
  await expect(page.locator("#dictionary-preview-file")).toHaveCount(0);
});

test("resumable import retries a lost response with the same key and finalizes", async ({ page }) => {
  await page.route("**/api/admin/login", async (route) => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  let firstApplyKey: string | null = null;
  let applyCount = 0;
  let finalized = false;
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (typeof body !== "object" || body === null || !("operation" in body) || !("requestId" in body) || !("input" in body) || typeof body.input !== "object" || body.input === null) throw new Error("Invalid request");
    const common = { ok: true, requestId: body.requestId };
    if (body.operation === "list") return route.fulfill({ json: { ...common, data: { items: finalized ? [{ id: "30000000-0000-4000-8000-000000000001", sourceId: "10000000-0000-4000-8000-000000000001", original: "mèo", normalized: "MÈO", level: 3, definitionVi: "Một con vật.", review: "pending", collision: false, revisionNumber: 1 }] : [], nextCursor: null, draftRevision: finalized ? "1" : "0" } } });
    if (body.operation === "import-preview") return route.fulfill({ json: { ...common, data: { valid: true, entryCount: 1, collisionCount: 0, duplicateCount: 0, conflictCount: 0, canonicalHash: createHash("sha256").update(canonicalJson(body.input)).digest("hex"), errors: [], errorsTruncated: false } } });
    if (body.operation === "import-start") return route.fulfill({ json: { ...common, data: { importId: "60000000-0000-4000-8000-000000000006", expectedChunks: 1, status: "staging", draftRevision: "0", receipts: [] } } });
    if (body.operation === "import-apply") {
      if (!("idempotencyKey" in body) || typeof body.idempotencyKey !== "string" || !("canonicalHash" in body.input) || typeof body.input.canonicalHash !== "string") throw new Error("Invalid apply");
      applyCount++;
      if (applyCount === 1) { firstApplyKey = body.idempotencyKey; return route.fulfill({ status: 503 }); }
      expect(body.idempotencyKey).toBe(firstApplyKey);
      return route.fulfill({ json: { ...common, data: { chunkIndex: 0, canonicalHash: body.input.canonicalHash, stagedCount: 1, createdCount: 1, noOpCount: 0, countsProvisional: true } } });
    }
    if (body.operation === "import-finalize") { finalized = true; return route.fulfill({ json: { ...common, data: { status: "finalized", draftRevision: "1", createdCount: 1, noOpCount: 0 } } }); }
    throw new Error("Unexpected operation");
  });
  await page.goto("/admin#dictionary");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await page.locator("#dictionary-preview-file").setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json") });
  await page.getByRole("button", { name: /Bắt đầu hoặc tiếp tục|Start or resume/i }).click();
  await page.getByRole("button", { name: /Thử lại an toàn|Retry safely/i }).click();
  await expect(page.getByText(/Đã hoàn tất, chờ duyệt|Finalized, awaiting review/i)).toBeVisible();
  await page.getByRole("link", { name: /Duyệt|Review/i }).click();
  await expect(page.getByRole("button", { name: /mèo · 3/i })).toBeVisible();
});

test("an administrator can resume an import with an existing receipt", async ({ page }) => {
  await page.route("**/api/admin/login", async (route) => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (typeof body !== "object" || body === null || !("operation" in body) || !("requestId" in body) || !("input" in body)) throw new Error("Invalid request");
    const common = { ok: true, requestId: body.requestId };
    if (body.operation === "list") return route.fulfill({ json: { ...common, data: { items: [], nextCursor: null, draftRevision: "0" } } });
    if (body.operation === "import-preview") return route.fulfill({ json: { ...common, data: { valid: true, entryCount: 1, collisionCount: 0, duplicateCount: 0, conflictCount: 0, canonicalHash: createHash("sha256").update(canonicalJson(body.input)).digest("hex"), errors: [], errorsTruncated: false } } });
    if (body.operation === "import-start") return route.fulfill({ json: { ...common, data: { importId: "60000000-0000-4000-8000-000000000006", expectedChunks: 1, status: "staging", draftRevision: "2", receipts: [{ chunkIndex: 0, canonicalHash: createHash("sha256").update(canonicalJson(JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8")))).digest("hex"), stagedCount: 1, createdCount: 0, noOpCount: 1, countsProvisional: true }] } } });
    if (body.operation === "import-finalize") return route.fulfill({ json: { ...common, data: { status: "finalized", draftRevision: "3", createdCount: 0, noOpCount: 1 } } });
    throw new Error("Unexpected operation");
  });
  await page.goto("/admin#dictionary");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await page.locator("#dictionary-preview-file").setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json") });
  await page.getByRole("button", { name: /Bắt đầu hoặc tiếp tục|Start or resume/i }).click();
  await expect(page.getByText(/Tiến độ nhập: 1\/1|Import progress: 1\/1/i)).toBeVisible();
  await expect(page.getByText(/Mục đã có, không thay đổi: 1|Existing unchanged candidates: 1/i)).toBeVisible();
});

test("an administrator reviews an answer with explicit exclusion checks", async ({ page }) => {
  await page.route("**/api/admin/login", async (route) => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  const id = "30000000-0000-4000-8000-000000000001";
  const sourceId = "10000000-0000-4000-8000-000000000001";
  let approved = false;
  let cleared = false;
  let filtered = false;
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (typeof body !== "object" || body === null || !("operation" in body) || !("requestId" in body)) throw new Error("Invalid request");
    const common = { ok: true, requestId: body.requestId };
    const current = { id: approved ? "40000000-0000-4000-8000-000000000002" : "40000000-0000-4000-8000-000000000001", revisionNumber: approved ? 2 : 1, original: "mèo", normalized: "MÈO", level: 3, definitionVi: "Một con vật.", review: approved ? "approved" : "pending", answerEligible: approved, category: approved ? "common" : null, rationale: approved ? "Đã kiểm tra nghĩa." : null, exclusionChecks: approved ? { names: true, abbreviations: true, offensive: true, malformed: true, unverified: true } : null };
    if (body.operation === "list") {
      if ("input" in body && typeof body.input === "object" && body.input !== null && "filters" in body.input && typeof body.input.filters === "object" && body.input.filters !== null && "level" in body.input.filters && body.input.filters.level === 3 && "collisionsOnly" in body.input.filters && body.input.filters.collisionsOnly === true) filtered = true;
      return route.fulfill({ json: { ...common, data: { items: [{ id, sourceId, original: "mèo", normalized: "MÈO", level: 3, definitionVi: current.definitionVi, review: current.review, collision: false, revisionNumber: current.revisionNumber }], nextCursor: null, draftRevision: approved ? "1" : "0" } } });
    }
    if (body.operation === "detail") return route.fulfill({ json: { ...common, data: { id, sourceId, rightsReview: cleared ? { id, previousReviewId: null, decision: "cleared", evidence: "private evidence", obligations: "private obligations", createdAt: "2026-01-01T00:00:00Z", actorRole: "admin" } : null, attributionPreview: { id, sourceName: "Fixture", sourceEntryId: "synthetic", sourceSenseId: null, entryUrl: "https://example.invalid/entry", artifactUrl: "https://example.invalid/source", artifactSha256: "0".repeat(64), resourceRevision: "v1", artifactRevision: "artifact-v1", licenseName: "Synthetic", licenseVersion: null, licenseUrl: "https://example.invalid/license", attributionText: "Synthetic fixture", historyUrl: null, modificationsNotice: "Synthetic" }, entryUrl: "https://example.invalid/entry", sourceEntryId: "synthetic", sourceSenseId: null, sourceNotes: null, source: { name: "Fixture", artifactUrl: "https://example.invalid/source", artifactSha256: "0".repeat(64), resourceRevision: "v1", originDump: null, retrievedAt: "2026-01-01T00:00:00Z", rights: { licenseName: "Synthetic", licenseVersion: null, licenseUrl: "https://example.invalid/license", attributionText: "Synthetic fixture", historyUrl: null, redistributionNote: "Synthetic", modificationsNotice: "Synthetic" } }, current, draftRevision: approved ? "1" : "0", history: { items: [current], nextCursor: null } } } });
    if (body.operation === "collision") return route.fulfill({ json: { ...common, data: { items: [], nextCursor: null, selectedRevisionId: null, answerRevisionId: null, unresolved: false, eligibleCount: 0, draftRevision: "0" } } });
    if (body.operation === "rights-review") { cleared = true; return route.fulfill({ json: { ...common, data: { rightsReviewId: id, draftRevision: "2" } } }); }
    if (body.operation === "review") {
      if (!("input" in body) || typeof body.input !== "object" || body.input === null || !("exclusionChecks" in body.input)) throw new Error("Missing checks");
      expect(body.input.exclusionChecks).toEqual({ names: true, abbreviations: true, offensive: true, malformed: true, unverified: true });
      approved = true;
      return route.fulfill({ json: { ...common, data: { entryId: id, revisionNumber: 2, review: "approved", answerEligible: true, draftRevision: "1" } } });
    }
    throw new Error("Unexpected operation");
  });
  await page.goto("/admin#dictionary");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await page.getByRole("link", { name: /Duyệt|Review/i }).click();
  await page.locator("summary").filter({ hasText: /Bộ lọc khác|More filters/i }).click();
  await page.getByLabel(/Số chữ|Letter count/i).selectOption("3");
  await page.getByLabel(/Chỉ mục trùng cách viết|Only matching spellings/i).check();
  await page.getByRole("button", { name: /Áp dụng bộ lọc|Apply filters/i }).click();
  await expect.poll(() => filtered).toBe(true);
  await page.getByRole("button", { name: /mèo · 3/i }).click();
  await page.locator("#editorial-review").selectOption("approved");
  await page.getByLabel(/tên riêng|proper name/i).check();
  await page.getByLabel(/chữ viết tắt|abbreviation/i).check();
  await page.getByLabel(/xúc phạm|offensive/i).check();
  await page.getByLabel(/sai cấu trúc|malformed/i).check();
  await page.getByLabel(/chưa kiểm chứng|unverified generated/i).check();
  await page.getByLabel(/độ thông dụng; đủ điều kiện|eligible as an answer/i).check();
  await page.locator("#editorial-rationale").fill("Đã kiểm tra nghĩa và độ thông dụng.");
  await page.getByRole("button", { name: /Lưu duyệt|Save review/i }).click();
  await expect(page.getByRole("button", { name: /mèo · 3 · Đã duyệt|mèo · 3 · Approved/i })).toBeVisible();
  await page.locator("summary").filter({ hasText: /Duyệt quyền nguồn|Review source rights/i }).click();
  await page.locator("#rights-decision").selectOption("cleared");
  await page.locator("#rights-evidence").fill("private evidence");
  await page.locator("#rights-obligations").fill("private obligations");
  await page.getByRole("button", { name: /Lưu quyết định quyền|Save rights decision/i }).click();
  await expect.poll(() => cleared).toBe(true);
  const preview = page.locator("div", { has: page.getByRole("heading", { name: /Xem trước ghi công cho người chơi|Player attribution preview/i }) }).filter({ hasText: "Synthetic fixture" }).last();
  await expect(preview).toBeVisible();
  await expect(preview).not.toContainText("private evidence");
});

test("late private preview cannot reappear after logout and login", async ({ page }) => {
  let release: (() => void) | undefined;
  let requested: (() => void) | undefined;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const seen = new Promise<void>(resolve => { requested = resolve; });
  await page.route("**/api/admin/login", route => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async route => {
    const body: unknown = route.request().postDataJSON();
    if (typeof body !== "object" || body === null || !("requestId" in body)) throw new Error("Missing request ID");
    if ("operation" in body && body.operation === "list") return route.fulfill({ json: { ok: true, requestId: body.requestId, data: { items: [], nextCursor: null, draftRevision: "0" } } });
    requested?.(); await blocked;
    await route.fulfill({ json: { ok: true, requestId: body.requestId, data: { valid: true, entryCount: 1, collisionCount: 0, duplicateCount: 0, conflictCount: 0, canonicalHash: "0".repeat(64), errors: [], errorsTruncated: false } } }).catch(() => {});
  });
  await page.goto("/admin#dictionary");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin"); await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await page.locator("#dictionary-preview-file").setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json") });
  await seen;
  await page.getByRole("button", { name: /Đăng xuất|Log out/i }).click(); release?.();
  await page.getByLabel(/Tài khoản|Username/i).fill("admin"); await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await expect(page.locator("#dictionary-preview-file")).toHaveValue("");
  await expect(page.getByRole("heading", { name: /Kiểm tra tin cậy|Trusted preview/i })).toHaveCount(0);
});

test("an import paused by an expired session resumes after sign-in without choosing files again", async ({ page }) => {
  const fixture = readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8");
  const canonicalHash = createHash("sha256").update(canonicalJson(JSON.parse(fixture))).digest("hex");
  const importId = "60000000-0000-4000-8000-000000000006";
  const receipt = { chunkIndex: 0, canonicalHash, stagedCount: 1, createdCount: 1, noOpCount: 0, countsProvisional: true };
  let applied = 0;
  await page.route("**/api/admin/login", (route) => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (typeof body !== "object" || body === null || !("operation" in body) || !("requestId" in body)) throw new Error("Malformed request");
    const success = (data: unknown) => route.fulfill({ json: { ok: true, requestId: body.requestId, data } });
    if (body.operation === "list") return success({ items: [], nextCursor: null, draftRevision: "0" });
    if (body.operation === "import-preview") return success({ valid: true, entryCount: 1, collisionCount: 0, duplicateCount: 0, conflictCount: 0, canonicalHash, errors: [], errorsTruncated: false });
    if (body.operation === "import-start") return success({ importId, expectedChunks: 1, status: "staging", draftRevision: "0", receipts: applied ? [receipt] : [] });
    if (body.operation === "import-apply") {
      applied++;
      return success(receipt);
    }
    if (body.operation === "import-finalize") {
      if (await route.request().headerValue("authorization") === "Bearer test-token") {
        return route.fulfill({ status: 401, json: { ok: false } });
      }
      return success({ status: "finalized", draftRevision: "1", createdCount: 1, noOpCount: 0 });
    }
    throw new Error("Unexpected import operation");
  });
  const signIn = async () => {
    await page.getByLabel(/Tài khoản|Username/i).fill("admin");
    await page.getByLabel(/Mật khẩu|Password/i).fill("password");
    await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  };
  await page.goto("/admin#dictionary");
  await signIn();
  await page.locator("#dictionary-preview-file").setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: Buffer.from(fixture) });
  await page.getByRole("button", { name: /Bắt đầu hoặc tiếp tục|Start or resume/i }).click();
  await expect(page.getByLabel(/Tài khoản|Username/i)).toBeVisible();
  await page.route("**/api/admin/login", (route) => route.fulfill({ json: { token: "renewed-token", expiresAt: Date.now() + 60000 } }));
  await signIn();
  await expect(page.locator("#dictionary-preview-file")).toHaveValue("");
  await page.getByRole("button", { name: /Bắt đầu hoặc tiếp tục|Start or resume/i }).click();
  await expect(page.getByText(/Đã hoàn tất, chờ duyệt|Finalized, awaiting review/i)).toBeVisible();
  expect(applied).toBe(1);
});
