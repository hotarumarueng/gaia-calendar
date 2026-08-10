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
      "21-23": [],
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

  it("見出しと候補カード（曜日・時間帯・人数）を表示する", () => {
    const entries = [
      makeEntry("A", { "21-23": ["木"] }),
      makeEntry("B", { "21-23": ["木"] }),
    ];
    render(<ScheduleSummary entries={entries} />);

    expect(screen.getByText("今週集まれそうな時間・曜日")).toBeDefined();
    expect(screen.getByText("木")).toBeDefined();
    expect(screen.getByText("21:00-23:00")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("／ 2人が希望")).toBeDefined();
  });

  it("候補カードにその枠を希望した人の名前を並べる", () => {
    const entries = [
      makeEntry("A", { "21-23": ["木"] }),
      makeEntry("B", { "21-23": ["木"] }),
      makeEntry("C", { "10-12": ["土"] }),
    ];
    const { container } = render(<ScheduleSummary entries={entries} />);

    // 木 21-23 のカード（1件目）に A・B が並び、C は並ばない
    const firstCard = container.querySelectorAll(".summary-chip")[0];
    const names = [...firstCard.querySelectorAll(".summary-person")].map(
      (el) => el.textContent,
    );
    expect(names).toEqual(["A", "B"]);
  });

  it("見出しの右隣に「今週分」ラベルと今週の日付範囲を表示する", () => {
    const entries = [
      makeEntry("A", { "21-23": ["木"] }),
      makeEntry("B", { "21-23": ["木"] }),
    ];
    render(<ScheduleSummary entries={entries} />);

    expect(screen.getByText("今週分")).toBeDefined();
    // JST 2026-12-09（水）を含む週は 12/7（月）〜12/13（日）
    expect(screen.getByText("12/7（月）〜12/13（日）")).toBeDefined();
  });

  it("全員一致の候補には「全員OK」バッジを表示する", () => {
    const entries = [
      makeEntry("A", { "10-12": ["土"], "21-23": ["火"] }),
      makeEntry("B", { "10-12": ["土"] }),
    ];
    render(<ScheduleSummary entries={entries} />);

    // 土 10-12 は 2/2（全員一致）、火 21-23 は 1/2
    expect(screen.getAllByText("全員OK")).toHaveLength(1);
  });
});
