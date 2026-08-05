// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ScheduleSummary from "@/components/ScheduleSummary";
import type { MemberEntry, SlotId, Weekday } from "@/lib/types";

/** 全時間帯が空のダミーエントリを作る（必要な項目だけ上書き） */
function makeEntry(
  name: string,
  preferences: Partial<Record<SlotId, Weekday[]>> = {},
  comment = "",
): MemberEntry {
  return {
    name,
    comment,
    preferences: {
      "19-21": [],
      "21-23": [],
      "8-10": [],
      "10-12": [],
      ...preferences,
    },
    lastEditedAt: "2026-07-21T15:00:00",
  };
}

afterEach(cleanup);

// 週ラベルの検証用に「今日」を JST 2026-12-09（水）に固定する
// JST 2026-12-09 12:00 = UTC 2026-12-09 03:00
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.UTC(2026, 11, 9, 3, 0)));
});
afterAll(() => {
  vi.useRealTimers();
});

describe("ScheduleSummary: 集まれそうな枠の表示", () => {
  it("メンバーが0人ならゾーン自体を表示しない", () => {
    const { container } = render(<ScheduleSummary entries={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("候補がなければゾーン自体を表示しない", () => {
    const { container } = render(
      <ScheduleSummary entries={[makeEntry("A")]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("見出しと候補チップ（曜日・時間帯・人数）を表示する", () => {
    const entries = [
      makeEntry("A", { "19-21": ["木"] }),
      makeEntry("B", { "19-21": ["木"] }),
    ];
    render(<ScheduleSummary entries={entries} />);

    expect(screen.getByText("今週集まれそうな時間・曜日")).toBeDefined();
    expect(screen.getByText("木")).toBeDefined();
    expect(screen.getByText("19:00-21:00")).toBeDefined();
    expect(screen.getByText("2/2人")).toBeDefined();
  });

  it("見出しの右隣に「今週分」ラベルと今週の日付範囲を表示する", () => {
    const entries = [
      makeEntry("A", { "19-21": ["木"] }),
      makeEntry("B", { "19-21": ["木"] }),
    ];
    render(<ScheduleSummary entries={entries} />);

    expect(screen.getByText("今週分")).toBeDefined();
    // JST 2026-12-09（水）を含む週は 12/7（月）〜12/13（日）
    expect(screen.getByText("12/7（月）〜12/13（日）")).toBeDefined();
  });

  it("コメントを書いた人がいれば、名前とコメントを二段レイアウトで表示する", () => {
    const entries = [
      makeEntry("A", { "19-21": ["木"] }, "今週は忙しめ"),
      makeEntry("B", { "19-21": ["木"] }),
      makeEntry("C", { "19-21": ["木"] }, "状況次第でおじゃまします！"),
    ];
    render(<ScheduleSummary entries={entries} />);

    expect(screen.getByText("A")).toBeDefined();
    expect(screen.getByText("今週は忙しめ")).toBeDefined();
    expect(screen.getByText("C")).toBeDefined();
    expect(screen.getByText("状況次第でおじゃまします！")).toBeDefined();
    // コメント無しの B は名前として出ないこと（チップの曜日「木」とは別枠）
    expect(screen.queryByText("B")).toBeNull();
  });

  it("誰もコメントを書いていなければコメント欄自体を出さない", () => {
    const entries = [
      makeEntry("A", { "19-21": ["木"] }),
      makeEntry("B", { "19-21": ["木"] }),
    ];
    const { container } = render(<ScheduleSummary entries={entries} />);
    expect(container.querySelector(".summary-comments")).toBeNull();
  });

  it("全員一致の候補には「全員OK」バッジを表示する", () => {
    const entries = [
      makeEntry("A", { "8-10": ["月"], "21-23": ["土"] }),
      makeEntry("B", { "8-10": ["月"] }),
    ];
    render(<ScheduleSummary entries={entries} />);

    // 月 8-10 は 2/2（全員一致）、土 21-23 は 1/2
    expect(screen.getAllByText("全員OK")).toHaveLength(1);
  });
});
