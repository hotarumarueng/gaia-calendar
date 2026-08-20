// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import RosterList from "@/components/RosterList";
import type { MemberEntry } from "@/lib/types";

/** design.md（identity / State Management）で定められた localStorage キー */
const STORAGE_KEY = "gaia-calendar:name";

/** 全時間帯が空のダミーエントリを作る（必要な項目だけ上書き） */
function makeEntry(overrides: Partial<MemberEntry> = {}): MemberEntry {
  return {
    name: "とりうみ",
    comment: "",
    preferences: { "21-23": [], "10-12": [] },
    // タイムゾーン指定なし = ローカル時刻として解釈され、表示テストが環境非依存になる
    lastEditedAt: "2026-07-21T15:00:00+09:00",
    answeredThisWeek: true,
    ...overrides,
  };
}

/** 名前からその参加者の行 <li> を特定する */
function getRowByName(name: string): HTMLElement {
  const row = screen.getByText(name).closest("li");
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

describe("RosterList: 回答状況の描画（1.1, 1.4, 4.3）", () => {
  it("参加者を1人1行で並べる", () => {
    render(
      <RosterList
        entries={[makeEntry({ name: "とりうみ" }), makeEntry({ name: "ほたる" })]}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(getRowByName("とりうみ")).toBeDefined();
    expect(getRowByName("ほたる")).toBeDefined();
  });

  it("コメントと最終編集日時を行に表示する", () => {
    render(<RosterList entries={[makeEntry({ comment: "今週は忙しめ" })]} />);

    const row = getRowByName("とりうみ");
    expect(within(row).getByText("今週は忙しめ")).toBeDefined();
    // "2026-07-21T15:00:00+09:00" → JST 固定の読みやすい形式
    expect(within(row).getByText("7/21 15:00")).toBeDefined();
  });

  it("コメントが空でも行は表示される", () => {
    render(<RosterList entries={[makeEntry({ comment: "" })]} />);

    expect(getRowByName("とりうみ")).toBeDefined();
  });
});

describe("RosterList: 空状態（1.5）", () => {
  it("参加者ゼロのときはリストの代わりに案内文を表示する", () => {
    render(<RosterList entries={[]} />);

    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText(/まだ誰も入力していません/)).toBeDefined();
  });
});

describe("RosterList: 本人行のみ操作表示（3.2, 3.3）", () => {
  it("ブラウザに記憶された名前と一致する行にのみ編集・削除ボタンを表示する", () => {
    window.localStorage.setItem(STORAGE_KEY, "とりうみ");
    const entries = [makeEntry({ name: "とりうみ" }), makeEntry({ name: "ほたる" })];
    render(<RosterList entries={entries} />);

    const myRow = getRowByName("とりうみ");
    expect(within(myRow).getByRole("button", { name: "編集" })).toBeDefined();
    expect(within(myRow).getByRole("button", { name: "削除" })).toBeDefined();

    const otherRow = getRowByName("ほたる");
    expect(within(otherRow).queryByRole("button")).toBeNull();
  });

  it("名前が記憶されていないブラウザではどの行にもボタンを表示しない", () => {
    const entries = [makeEntry({ name: "とりうみ" }), makeEntry({ name: "ほたる" })];
    render(<RosterList entries={entries} />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("編集ボタンで onEdit がその行のエントリを引数に呼ばれる", () => {
    window.localStorage.setItem(STORAGE_KEY, "とりうみ");
    const entry = makeEntry({ name: "とりうみ" });
    const onEdit = vi.fn();
    render(<RosterList entries={[entry]} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(entry);
  });

  it("削除ボタンで onDelete がその行の名前を引数に呼ばれる", () => {
    window.localStorage.setItem(STORAGE_KEY, "とりうみ");
    const onDelete = vi.fn();
    render(<RosterList entries={[makeEntry({ name: "とりうみ" })]} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(onDelete).toHaveBeenCalledExactlyOnceWith("とりうみ");
  });
});

describe("RosterList: 週次リセット後の未入力表示", () => {
  /** 名簿にはいるが今週まだ入力していない人（曜日・コメント・最終編集日時が空） */
  function makePendingEntry(name: string): MemberEntry {
    return makeEntry({
      name,
      comment: "",
      lastEditedAt: "",
      answeredThisWeek: false,
    });
  }

  it("今週まだ入力していない人の行に「未入力」を出す", () => {
    render(<RosterList entries={[makePendingEntry("とりうみ")]} />);

    expect(within(getRowByName("とりうみ")).getByText("未入力")).toBeDefined();
  });

  it("入力済みの人の行には「未入力」を出さない", () => {
    render(<RosterList entries={[makeEntry({ name: "とりうみ" })]} />);

    expect(within(getRowByName("とりうみ")).queryByText("未入力")).toBeNull();
  });

  it("未入力の行には最終編集日時を表示しない", () => {
    const { container } = render(
      <RosterList entries={[makePendingEntry("とりうみ")]} />,
    );

    expect(container.querySelector(".roster-time")?.textContent).toBe("");
  });

  it("未入力でも名前は名簿に並び、本人なら編集・削除ボタンが出る", () => {
    // 週次リセットの狙いは「名前は残す」こと。行ごと消えてはいけない
    window.localStorage.setItem(STORAGE_KEY, "とりうみ");
    render(<RosterList entries={[makePendingEntry("とりうみ")]} />);

    const row = getRowByName("とりうみ");
    expect(within(row).getByText("とりうみ")).toBeDefined();
    expect(within(row).getByRole("button", { name: "編集" })).toBeDefined();
    expect(within(row).getByRole("button", { name: "削除" })).toBeDefined();
  });

  it("入力済みと未入力が混在しても全員分の行が並ぶ", () => {
    render(
      <RosterList
        entries={[makeEntry({ name: "とりうみ" }), makePendingEntry("ほたる")]}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByText("未入力")).toHaveLength(1);
  });
});
