// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewEditor } from "@/components/molecules/EditorialReviewForm";
import type { EditorialDetail } from "@/hooks/useEditorialReviewForm";

vi.mock("@/hooks/useAppI18n", () => ({ useAppI18n: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

const detail: EditorialDetail = {
  id: "12345678-1234-4000-8000-123456789abc",
  draftRevision: "8",
  current: {
    id: "12345678-1234-4000-8000-123456789abd",
    revisionNumber: 3,
    original: "ban",
    normalized: "ban",
    level: 3,
    definitionVi: "Một nhóm người",
    openingClue: "Nhóm phụ trách",
    review: "pending",
    category: null,
    answerEligible: false,
    rationale: null,
    exclusionChecks: null,
    actorRole: null,
    createdAt: null,
    bulkBatchId: null,
  },
};

function setup() {
  const save = vi.fn(async () => true);
  const props = { detail, save, saving: false, locked: false, canRetry: false, discardReview: vi.fn() };
  const view = render(<ReviewEditor {...props} />);
  return { save, props, view, user: userEvent.setup() };
}

describe("editorial review form", () => {
  it("loads the current entry and refreshes a clean form when its revision changes", async () => {
    const { props, view } = setup();
    const original = screen.getByRole<HTMLInputElement>("textbox", { name: "editorial.original" });
    expect(original.value).toBe("ban");
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "editorial.definition" }).value).toBe("Một nhóm người");
    expect(screen.getByRole("button", { name: "wordManagement.cancel" }).hasAttribute("disabled")).toBe(true);
    view.rerender(<ReviewEditor {...props} detail={{ ...detail, current: { ...detail.current, original: "bàn", revisionNumber: 4 } }} />);
    await waitFor(() => expect(original.value).toBe("bàn"));
  });

  it("links the spelling error to its input and focuses it after a failed submit", async () => {
    const { save, user } = setup();
    const original = screen.getByRole("textbox", { name: "editorial.original" });
    await user.clear(original);
    await user.click(screen.getByRole("button", { name: "editorial.save" }));
    const error = await screen.findByRole("alert");
    expect(error.textContent).toBe("wordManagement.invalidSpelling");
    expect(original.getAttribute("aria-describedby")).toBe(error.id);
    expect(document.activeElement).toBe(original);
    expect(save).not.toHaveBeenCalled();
  });

  it("submits the edited values with their revision and existing review contract", async () => {
    const { save, user } = setup();
    const openingClue = screen.getByRole("textbox", { name: "editorial.openingClue" });
    await user.clear(openingClue);
    await user.type(openingClue, "  Gợi ý mới  ");
    await user.click(screen.getByRole("button", { name: "editorial.save" }));
    await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith({
      entryId: detail.id,
      expectedEntryRevision: 3,
      expectedDraftRevision: "8",
      original: "ban",
      definitionVi: "Một nhóm người",
      openingClue: "Gợi ý mới",
      review: "pending",
      category: "common",
      answerEligible: false,
      rationale: "",
      exclusionChecks: { names: false, abbreviations: false, offensive: false, malformed: false, unverified: false },
    }, false));
  });

  it("preserves dirty edits on a revision conflict until the user discards them", async () => {
    const { props, view, user, save } = setup();
    const original = screen.getByRole<HTMLInputElement>("textbox", { name: "editorial.original" });
    await user.clear(original);
    await user.type(original, "bạn");
    view.rerender(<ReviewEditor {...props} detail={{ ...detail, current: { ...detail.current, original: "bàn", revisionNumber: 4 } }} />);
    expect((await screen.findByRole("alert")).textContent).toBe("editorialWorkspace.staleEditor");
    expect(original.value).toBe("bạn");
    await user.click(screen.getByRole("button", { name: "editorial.save" }));
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "wordManagement.cancel" }));
    expect(original.value).toBe("bàn");
  });
});
