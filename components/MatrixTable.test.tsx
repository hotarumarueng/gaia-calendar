// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import MatrixTable from "@/components/MatrixTable";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { MemberEntry } from "@/lib/types";

/** design.md（identity / State Management）で定められた localStorage キー */
const STORAGE_KEY = "gaia-calendar:name";

/** 全時間帯が空のダミーエントリを作る（必要な項目だけ上書き） */
function makeEntry(overrides: Partial<MemberEntry> = {}): MemberEntry {
  return {
    name: "とりうみ",
    comment: "",
    preferences: { "19-21": [], "21-23": [], "8-10": [], "10-12": [] },
    // タイムゾーン指定なし = ローカル時刻として解釈され、表示テストが環境非依存になる
    lastEditedAt: "2026-07-21T15:00:00",
    ...overrides,
  };
}

/** 名前セル（行ヘッダ）からその参加者の行 <tr> を特定する */
function getRowByName(name: string): HTMLElement {
  const rowHeader = screen.getByRole("rowheader", { name });
  const row = rowHeader.closest("tr");
  if (!(row instanceof HTMLElement)) {
    throw new Error(`row for ${name} not found`);
  }
  return row;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("MatrixTable: マトリクス描画（1.1, 1.2, 1.3）", () => {
  it("固定4時間帯のヘッダをすべて表示する", () => {
    render(<MatrixTable entries={[makeEntry()]} />);

    for (const slot of TIME_SLOTS) {
      expect(
        screen.getByRole("columnheader", { name: slot.label }),
      ).toBeDefined();
    }
  });

  it("セルに希望曜日を「・」区切りで表示する", () => {
    const entry = makeEntry({
      preferences: {
        "19-21": ["火", "木"],
        "21-23": ["土"],
        "8-10": [],
        "10-12": [],
      },
    });
    render(<MatrixTable entries={[entry]} />);

    const cells = within(getRowByName("とりうみ")).getAllByRole("cell");
    // 列順は TIME_SLOTS 順（19-21, 21-23, 8-10, 10-12）
    expect(cells[0].textContent).toBe("火・木");
    expect(cells[1].textContent).toBe("土");
  });

  it("希望が未入力（空配列）の時間帯セルは空欄になる", () => {
    render(<MatrixTable entries={[makeEntry()]} />);

    const cells = within(getRowByName("とりうみ")).getAllByRole("cell");
    for (let i = 0; i < TIME_SLOTS.length; i++) {
      expect(cells[i].textContent).toBe("");
    }
  });
});

describe("MatrixTable: コメントと最終編集日時（1.4, 4.3）", () => {
  it("コメントと最終編集日時を行に表示する", () => {
    const entry = makeEntry({ comment: "今週は忙しめ" });
    render(<MatrixTable entries={[entry]} />);

    const row = getRowByName("とりうみ");
    expect(within(row).getByText("今週は忙しめ")).toBeDefined();
    // "2026-07-21T15:00:00" → 日本語ロケールの読みやすい形式
    expect(within(row).getByText("7/21 15:00")).toBeDefined();
  });

  it("コメントが空でも行は表示される（コメント欄は空のまま）", () => {
    render(<MatrixTable entries={[makeEntry({ comment: "" })]} />);

    expect(screen.getByRole("rowheader", { name: "とりうみ" })).toBeDefined();
  });
});

describe("MatrixTable: 空状態（1.5）", () => {
  it("参加者ゼロのときは表の代わりに案内文を表示する", () => {
    render(<MatrixTable entries={[]} />);

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/まだ誰も入力していません/)).toBeDefined();
  });
});

describe("MatrixTable: 本人行のみ操作表示（3.2, 3.3）", () => {
  it("ブラウザに記憶された名前と一致する行にのみ編集・削除ボタンを表示する", () => {
    window.localStorage.setItem(STORAGE_KEY, "とりうみ");
    const entries = [makeEntry({ name: "とりうみ" }), makeEntry({ name: "ほたる" })];
    render(<MatrixTable entries={entries} />);

    const myRow = getRowByName("とりうみ");
    expect(within(myRow).getByRole("button", { name: "編集" })).toBeDefined();
    expect(within(myRow).getByRole("button", { name: "削除" })).toBeDefined();

    const otherRow = getRowByName("ほたる");
    expect(within(otherRow).queryByRole("button")).toBeNull();
  });

  it("名前が記憶されていないブラウザではどの行にもボタンを表示しない", () => {
    const entries = [makeEntry({ name: "とりうみ" }), makeEntry({ name: "ほたる" })];
    render(<MatrixTable entries={entries} />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("編集ボタンで onEdit がその行のエントリを引数に呼ばれる", () => {
    window.localStorage.setItem(STORAGE_KEY, "とりうみ");
    const entry = makeEntry({ name: "とりうみ" });
    const onEdit = vi.fn();
    render(<MatrixTable entries={[entry]} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(entry);
  });

  it("削除ボタンで onDelete がその行の名前を引数に呼ばれる", () => {
    window.localStorage.setItem(STORAGE_KEY, "とりうみ");
    const onDelete = vi.fn();
    render(<MatrixTable entries={[makeEntry({ name: "とりうみ" })]} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(onDelete).toHaveBeenCalledExactlyOnceWith("とりうみ");
  });
});

describe("MatrixTable: スマホ幅対応（6.3）", () => {
  it("表は横スクロールコンテナ（.matrix-wrap）に包まれる", () => {
    const { container } = render(<MatrixTable entries={[makeEntry()]} />);

    const wrap = container.querySelector(".matrix-wrap");
    expect(wrap).not.toBeNull();
    expect(wrap?.querySelector("table")).not.toBeNull();
  });
});
