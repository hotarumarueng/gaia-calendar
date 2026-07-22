// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ScheduleSummary from "@/components/ScheduleSummary";
import type { MemberEntry, SlotId, Weekday } from "@/lib/types";

/** 全時間帯が空のダミーエントリを作る（必要な項目だけ上書き） */
function makeEntry(
  name: string,
  preferences: Partial<Record<SlotId, Weekday[]>> = {},
): MemberEntry {
  return {
    name,
    comment: "",
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
