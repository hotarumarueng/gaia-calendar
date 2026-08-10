// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import AvailabilityGrid from "@/components/AvailabilityGrid";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { MemberEntry, SlotId, Weekday } from "@/lib/types";

/** 全時間帯が空のダミーエントリを作る（必要な枠だけ上書き） */
function makeEntry(
  name: string,
  preferences: Partial<Record<SlotId, Weekday[]>> = {},
): MemberEntry {
  return {
    name,
    comment: "",
    preferences: { "21-23": [], "10-12": [], ...preferences },
    lastEditedAt: "2026-07-21T15:00:00",
  };
}

/** 名前行の本文セル（先頭の行ヘッダを除く）を左から順に返す */
function cellTextsFor(name: string): (string | null)[] {
  const row = screen.getByRole("rowheader", { name }).closest("tr");
  if (!(row instanceof HTMLElement)) throw new Error(`row for ${name} not found`);
  return [...row.querySelectorAll("td")].map((td) => td.textContent);
}

afterEach(cleanup);

describe("AvailabilityGrid: ヘッダ", () => {
  it("時間帯の見出しを枠の数だけ、選べる曜日数ぶんの colspan で出す", () => {
    render(<AvailabilityGrid entries={[makeEntry("A")]} />);

    for (const slot of TIME_SLOTS) {
      const head = screen.getByRole("columnheader", { name: slot.label });
      expect(head.getAttribute("colspan")).toBe(String(slot.weekdays.length));
    }
  });

  it("曜日ヘッダは (時間帯 × 選べる曜日) を展開した並びになる", () => {
    const { container } = render(<AvailabilityGrid entries={[makeEntry("A")]} />);

    const dayHeads = [...container.querySelectorAll(".avail-day-head")].map(
      (el) => el.textContent,
    );
    expect(dayHeads).toEqual([
      "月",
      "火",
      "水",
      "木",
      "金",
      "土",
      "日", // 21:00-23:00
      "土",
      "日", // 10:00-12:00
    ]);
  });
});

describe("AvailabilityGrid: セル", () => {
  it("希望した枠のセルだけ ○ になる", () => {
    render(
      <AvailabilityGrid
        entries={[makeEntry("A", { "21-23": ["水", "土"], "10-12": ["日"] })]}
      />,
    );

    // 列順: 21-23 の月火水木金土日 → 10-12 の土日
    expect(cellTextsFor("A")).toEqual([
      "",
      "",
      "○",
      "",
      "",
      "○",
      "",
      "",
      "○",
    ]);
  });

  it("参加者を行として全員分並べる", () => {
    render(
      <AvailabilityGrid
        entries={[makeEntry("A"), makeEntry("B"), makeEntry("C")]}
      />,
    );

    for (const name of ["A", "B", "C"]) {
      expect(screen.getByRole("rowheader", { name })).toBeDefined();
    }
  });
});

describe("AvailabilityGrid: 合計行", () => {
  it("列ごとの希望人数を出す", () => {
    const { container } = render(
      <AvailabilityGrid
        entries={[
          makeEntry("A", { "21-23": ["月", "水"], "10-12": ["土"] }),
          makeEntry("B", { "21-23": ["水"], "10-12": ["土", "日"] }),
        ]}
      />,
    );

    const totals = [...container.querySelectorAll(".avail-total")].map(
      (el) => el.textContent,
    );
    //            月   火   水   木   金   土   日 | 土   日
    expect(totals).toEqual(["1", "0", "2", "0", "0", "0", "0", "2", "1"]);
  });

  it("最多の列に data-top が付く", () => {
    const { container } = render(
      <AvailabilityGrid
        entries={[
          makeEntry("A", { "21-23": ["水"] }),
          makeEntry("B", { "21-23": ["水"] }),
        ]}
      />,
    );

    const top = [...container.querySelectorAll(".avail-total[data-top]")].map(
      (el) => el.textContent,
    );
    expect(top).toEqual(["2"]);
  });

  it("合計行には行ヘッダ「合計」が付く", () => {
    render(<AvailabilityGrid entries={[makeEntry("A")]} />);
    expect(screen.getByRole("rowheader", { name: "合計" })).toBeDefined();
  });
});

describe("AvailabilityGrid: 空状態", () => {
  it("参加者ゼロなら何も描画しない", () => {
    const { container } = render(<AvailabilityGrid entries={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("AvailabilityGrid: スマホ幅対応", () => {
  it("表は横スクロールコンテナ（.avail-wrap）に包まれる", () => {
    const { container } = render(<AvailabilityGrid entries={[makeEntry("A")]} />);

    const wrap = container.querySelector(".avail-wrap");
    expect(wrap).not.toBeNull();
    expect(within(wrap as HTMLElement).getByRole("table")).toBeDefined();
  });
});
