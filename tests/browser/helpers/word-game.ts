import { expect, type Page } from "@playwright/test";
import { playerPayload, playerReleaseRow } from "../../vua-tieng-viet/player-fixture";
import type { WordLevel } from "../../../types/vua-tieng-viet";

export async function dictionary(page: Page, limit = 6) {
  const control: { row: ReturnType<typeof playerReleaseRow>; fail: boolean; absent: boolean; corrupt: boolean; pointers: number; onPointer?: () => void } = { row: playerReleaseRow(playerPayload(limit)), fail: false, absent: false, corrupt: false, pointers: 0 };
  await page.route("https://test-supabase.invalid/rest/v1/**",async route => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe("Bearer test-anon-key");
    if (control.fail) return route.fulfill({ status: 503, json: {} });
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("vtv_current_release")) {
      control.pointers++; control.onPointer?.();
      return route.fulfill({ json: control.absent ? [] : [{ release_id: control.row.id, pointer_revision: "1" }] });
    }
    expect(url.pathname).toContain("vtv_releases");
    return route.fulfill({ json: [control.corrupt ? { ...control.row, payload_sha256: "0".repeat(64) } : control.row] });
  });
  return control;
}
export const input = (page: Page) => page.getByRole("textbox",{ name: /Nhập từ tiếng Việt|Enter a Vietnamese word/i });
export const board = (page: Page) => page.getByRole("list",{ name: /Bảng đoán từ|Guess board/i });
export const submit = (page: Page) => page.getByRole("button",{ name: "Gửi đáp án", exact: true });
export async function start(page: Page, level: WordLevel = 3, mode: "dictionary" | "free" = "dictionary") {
  await page.goto("/vua-tieng-viet");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  if (level !== 3 || mode !== "dictionary") {
    await page.getByRole("button",{ name: /Cài đặt|Settings/i, exact: true }).click();
    const settings = page.getByRole("dialog");
    await settings.getByRole("button",{ name: new RegExp(`^${level} (chữ|letters)$`) }).click();
    if (mode === "free") await settings.getByRole("button",{ name: /Tự do|Free/i, exact: true }).click();
    await settings.getByRole("button",{ name: /Áp dụng|Apply/i, exact: true }).click();
  }
  await page.getByRole("button",{ name: /Bắt đầu ván|Start round/i }).click();
  await expect(input(page)).toBeEnabled();
}
