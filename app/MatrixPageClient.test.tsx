// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import MatrixPageClient from "@/app/MatrixPageClient";
import type { MemberEntry } from "@/lib/types";

const STORAGE_KEY = "gaia-calendar:name";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/identity", () => ({
  saveMyName: vi.fn(),
  getMyName: () => {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  clearMyName: vi.fn(),
}));

function makeEntry(overrides: Partial<MemberEntry> = {}): MemberEntry {
  return {
    name: "とりうみ",
    comment: "テストコメント",
    preferences: { "21-23": ["火", "木"], "10-12": [] },
    lastEditedAt: "2026-07-21T15:00:00",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MatrixPageClient: 回答状況と入力フォームの統合（1.1, 6.1, 6.2）", () => {
  it("entries を回答状況リストと候補カードに表示する", () => {
    const { container } = render(<MatrixPageClient entries={[makeEntry()]} />);

    // 名前は「みんなの回答状況」に出る
    const roster = container.querySelector(".roster") as HTMLElement;
    expect(within(roster).getByText("とりうみ")).toBeDefined();

    // 希望曜日は候補カードとして出る（19-21 に 火・木 を入れてある）
    expect(screen.getByText("今週集まれそうな時間・曜日")).toBeDefined();
    const chips = container.querySelector(".summary-chips") as HTMLElement;
    expect(within(chips).getByText("火")).toBeDefined();
    expect(within(chips).getByText("木")).toBeDefined();
  });

  it("入力フォームを表示する", () => {
    render(<MatrixPageClient entries={[]} />);

    expect(
      screen.getByRole("form", { name: "希望入力フォーム" }),
    ).toBeDefined();
  });

  it("参加者ゼロ時は空状態の案内と入力フォームの両方を表示する", () => {
    render(<MatrixPageClient entries={[]} />);

    expect(screen.getByText(/まだ誰も入力していません/)).toBeDefined();
    expect(
      screen.getByRole("form", { name: "希望入力フォーム" }),
    ).toBeDefined();
  });
});

describe("MatrixPageClient: 編集フロー", () => {
  it("編集ボタンでフォームに既存データが反映される", () => {
    window.localStorage.setItem(STORAGE_KEY, "とりうみ");
    const entry = makeEntry({
      name: "とりうみ",
      comment: "元のコメント",
      preferences: { "21-23": ["月"], "10-12": [] },
    });
    render(<MatrixPageClient entries={[entry]} />);

    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    expect((screen.getByLabelText("名前") as HTMLInputElement).value).toBe(
      "とりうみ",
    );
    expect(
      (screen.getByLabelText("ひとことコメント（任意）") as HTMLTextAreaElement)
        .value,
    ).toBe("元のコメント");
    const slotGroup = screen.getByRole("group", { name: "21:00-23:00" });
    expect(
      (
        within(slotGroup).getByRole("checkbox", {
          name: "月",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("キャンセルボタンで新規入力モードに戻る", () => {
    window.localStorage.setItem(STORAGE_KEY, "とりうみ");
    render(<MatrixPageClient entries={[makeEntry()]} />);

    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    expect((screen.getByLabelText("名前") as HTMLInputElement).value).toBe(
      "とりうみ",
    );

    fireEvent.click(screen.getByRole("button", { name: "編集をキャンセル" }));
    expect((screen.getByLabelText("名前") as HTMLInputElement).value).toBe("");
  });
});

describe("MatrixPageClient: 削除フロー", () => {
  it("削除ボタンで確認後に DELETE API を呼び、表を更新する", async () => {
    window.localStorage.setItem(STORAGE_KEY, "とりうみ");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<MatrixPageClient entries={[makeEntry()]} />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/entries", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "とりうみ" }),
      });
    });
    expect(refreshMock).toHaveBeenCalledOnce();
  });

  it("確認ダイアログでキャンセルすると API を呼ばない", () => {
    window.localStorage.setItem(STORAGE_KEY, "とりうみ");
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<MatrixPageClient entries={[makeEntry()]} />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DELETE API 失敗時にエラーメッセージを表示する", async () => {
    window.localStorage.setItem(STORAGE_KEY, "とりうみ");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    render(<MatrixPageClient entries={[makeEntry()]} />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "削除に失敗しました。時間をおいて再試行してください",
    );
  });

  it("fetch が例外を投げても再試行メッセージを表示する", async () => {
    window.localStorage.setItem(STORAGE_KEY, "とりうみ");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    render(<MatrixPageClient entries={[makeEntry()]} />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "削除に失敗しました。時間をおいて再試行してください",
    );
  });
});
