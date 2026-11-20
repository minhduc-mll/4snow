import { expect, test } from "@playwright/test";
import { isRecord } from "../../lib/vua-tieng-viet/publication-contract";

const sourceId = "10000000-0000-4000-8000-000000000001";
const existingId = "30000000-0000-4000-8000-000000000001";
const addedId = "30000000-0000-4000-8000-000000000002";
const rights = {
  licenseName: "Synthetic", licenseVersion: null, licenseUrl: "https://example.invalid/license",
  attributionText: "Synthetic fixture", historyUrl: null, redistributionNote: "Synthetic",
  modificationsNotice: "Synthetic",
};
const source = {
  name: "Fixture", artifactUrl: "https://example.invalid/source", artifactSha256: "0".repeat(64),
  resourceRevision: "v1", originDump: null, retrievedAt: "2026-01-01T00:00:00Z", rights,
};
const existing = {
  id: "40000000-0000-4000-8000-000000000001", revisionNumber: 1, original: "mèo", normalized: "MÈO",
  level: 3, definitionVi: "Một con vật.", review: "pending", answerEligible: false,
  category: null, rationale: null, exclusionChecks: null,
};

test("admin checks an alternate meaning, adds it, and manages its lifecycle", async ({ page }) => {
  await page.route("**/api/admin/login", route => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  let draftRevision = 1;
  let revisions: (typeof existing)[] = [];
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async route => {
    const body: unknown = route.request().postDataJSON();
    if (!isRecord(body) || !isRecord(body.input)) throw new Error("Missing dictionary operation");
    const { input } = body;
    const reply = (data: unknown) => route.fulfill({ json: { ok: true, requestId: body.requestId, data } });
    const added = revisions.at(-1);
    const entries = [{ entryId: existingId, current: existing }, ...(added ? [{ entryId: addedId, current: added }] : [])];
    if (body.operation === "list") {
      const filters = input.filters;
      if (!isRecord(filters)) throw new Error("Missing filters");
      const items = entries
        .filter(({ current }) => (!filters.spelling || current.normalized.includes(String(filters.spelling))) && (!filters.review || current.review === filters.review))
        .map(({ entryId, current }) => ({ ...current, id: entryId, sourceId, collision: entries.length > 1 }));
      return reply({ items, nextCursor: null, draftRevision: String(draftRevision) });
    }
    if (body.operation === "candidate-sources") return reply({
      items: [{ id: sourceId, name: source.name, kind: "internal-editorial", resourceRevision: "v1", rightsDecision: "cleared" }], nextCursor: null,
    });
    if (body.operation === "collision") return reply({
      items: entries.map(({ entryId, current }) => ({
        entryId, revisionId: current.id, revisionNumber: current.revisionNumber, original: current.original,
        definitionVi: current.definitionVi, review: current.review, eligible: false,
        sourceName: source.name, sourceEntryId: entryId, sourceSenseId: null, entryUrl: "https://example.invalid/entry",
      })),
      selectedRevisionId: null, answerRevisionId: null, unresolved: false, eligibleCount: 0,
      nextCursor: null, draftRevision: String(draftRevision),
    });
    if (body.operation === "create-candidate") {
      expect(input).toMatchObject({ original: "mèo", sourceId, definitionVi: "Một nghĩa khác.", allowAlternateMeaning: true });
      const revision = { ...existing, id: "40000000-0000-4000-8000-000000000002", definitionVi: "Một nghĩa khác." };
      revisions = [revision];
      draftRevision++;
      return reply({ entryId: addedId, revisionId: revision.id, revisionNumber: 1, review: revision.review, draftRevision: String(draftRevision) });
    }
    if (body.operation === "detail") {
      const current = input.entryId === addedId ? added : existing;
      if (!current) throw new Error("Entry missing");
      return reply({
        id: input.entryId, sourceId, rightsReview: null, entryUrl: "https://example.invalid/entry",
        attributionPreview: {
          ...rights, id: input.entryId, sourceName: source.name, sourceEntryId: input.entryId,
          sourceSenseId: null, entryUrl: "https://example.invalid/entry", artifactUrl: source.artifactUrl,
          artifactSha256: source.artifactSha256, resourceRevision: source.resourceRevision, artifactRevision: "manual-fixture",
        },
        sourceEntryId: input.entryId, sourceSenseId: null, sourceNotes: null, source, current,
        draftRevision: String(draftRevision), history: { items: input.entryId === addedId ? revisions : [existing], nextCursor: null },
      });
    }
    if (body.operation === "review" && added) {
      expect(input.entryId).toBe(addedId);
      expect(input.expectedEntryRevision).toBe(added.revisionNumber);
      expect(input.review).toBe(added.review === "pending" ? "withdrawn" : "pending");
      const revisionNumber = added.revisionNumber + 1;
      const revision = {
        ...added, id: `40000000-0000-4000-8000-00000000000${revisionNumber + 1}`,
        revisionNumber, review: String(input.review), rationale: null,
      };
      revisions = [...revisions, revision];
      draftRevision++;
      return reply({ entryId: addedId, revisionId: revision.id, revisionNumber, review: revision.review, answerEligible: false, draftRevision: String(draftRevision) });
    }
    throw new Error(`Unexpected dictionary operation ${String(body.operation)}`);
  });

  await page.goto("/admin#dictionary/review");
  await page.getByLabel("Tài khoản").fill("admin");
  await page.getByLabel("Mật khẩu").fill("password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("button", { name: "Thêm từ", exact: true }).click();
  const form = page.getByRole("form", { name: "Thêm từ" });
  const save = form.getByRole("button", { name: "Lưu mục chờ duyệt" });
  await form.getByRole("combobox", { name: "Nguồn mục từ" }).selectOption(sourceId);
  await form.getByRole("textbox", { name: "Cách viết gốc" }).fill("mèo");
  await expect(save).toBeDisabled();
  await form.getByRole("button", { name: "Kiểm tra trùng" }).click();
  await expect(form.getByRole("button", { name: "Mở để sửa" })).toBeVisible();
  await expect(save).toBeDisabled();
  await form.getByRole("checkbox", { name: "Tôi muốn thêm một nghĩa khác" }).check();
  await form.getByRole("textbox", { name: /Định nghĩa tiếng Việt/ }).fill("Một nghĩa khác.");
  await save.click();
  await expect(form.getByText("Đã lưu mục chờ duyệt.")).toBeVisible();
  await page.getByRole("button", { name: "Đóng biểu mẫu thêm từ" }).click();

  const review = page.getByRole("region", { name: "Duyệt mục từ", exact: true });
  await expect(review).toHaveCount(1);
  await expect(review.getByRole("textbox", { name: "Nghĩa tiếng Việt" })).toHaveValue("Một nghĩa khác.");
  await page.getByRole("searchbox", { name: "Tìm theo chính tả" }).fill("MÈO");
  await page.getByRole("button", { name: "Áp dụng bộ lọc" }).click();
  const addedRow = page.getByRole("listitem").filter({ hasText: addedId });
  await addedRow.getByRole("button", { name: /mèo · 3 · Chờ duyệt/ }).click();
  await page.getByRole("button", { name: "Gỡ khỏi từ điển" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Gỡ khỏi từ điển" }).click();
  await expect(addedRow.getByRole("button", { name: /mèo · 3 · Đã gỡ/ })).toBeVisible();
  await expect(review).toHaveCount(0);
  await page.getByRole("button", { name: "Khôi phục về chờ duyệt" }).click();
  await expect(addedRow.getByRole("button", { name: /mèo · 3 · Chờ duyệt/ })).toBeVisible();
  await expect(review).toHaveCount(1);
  await expect(page.getByText(/#2 · mèo · Đã gỡ/)).toBeVisible();
  await expect(page.getByText(/#3 · mèo · Chờ duyệt/)).toBeVisible();
});
