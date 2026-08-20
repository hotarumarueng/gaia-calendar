import { describe, expect, it } from "vitest";
import { computeTopCandidates, countAnswered } from "@/lib/summary";
import type { MemberEntry, SlotId, Weekday } from "@/lib/types";

/** テスト用の preferences を組み立てるヘルパー */
function buildPreferences(
  overrides: Partial<Record<SlotId, Weekday[]>> = {},
): Record<SlotId, Weekday[]> {
  const base: Record<SlotId, Weekday[]> = {
    "21-23": [],
    "10-12": [],
  };
  return { ...base, ...overrides };
}

/** 全時間帯が空のダミーエントリを作る（必要な項目だけ上書き） */
function makeEntry(
  name: string,
  preferences: Partial<Record<SlotId, Weekday[]>> = {},
): MemberEntry {
  return {
    name,
    comment: "",
    preferences: buildPreferences(preferences),
    lastEditedAt: "2026-07-21T15:00:00",
    answeredThisWeek: true,
  };
}

describe("computeTopCandidates: 集まりやすい枠の集計", () => {
  it("メンバーが0人なら空配列を返す", () => {
    expect(computeTopCandidates([])).toEqual([]);
  });

  it("誰も曜日を選んでいなければ空配列を返す", () => {
    expect(computeTopCandidates([makeEntry("A"), makeEntry("B")])).toEqual([]);
  });

  it("1人の希望はすべて count=1 の候補になる", () => {
    const result = computeTopCandidates([
      makeEntry("A", { "21-23": ["火", "木"] }),
    ]);
    expect(result).toEqual([
      { slotId: "21-23", weekday: "火", count: 1, total: 1 },
      { slotId: "21-23", weekday: "木", count: 1, total: 1 },
    ]);
  });

  it("複数人が重なる枠が count 降順で先頭に来る", () => {
    const entries = [
      makeEntry("A", { "21-23": ["火", "木"], "10-12": ["土"] }),
      makeEntry("B", { "21-23": ["木"], "10-12": ["日"] }),
      makeEntry("C", { "21-23": ["木"] }),
    ];
    const result = computeTopCandidates(entries);
    expect(result[0]).toEqual({
      slotId: "21-23",
      weekday: "木",
      count: 3,
      total: 3,
    });
  });

  it("同数タイは TIME_SLOTS 順 → WEEKDAYS 順で安定する", () => {
    const entries = [
      makeEntry("A", { "10-12": ["日"], "21-23": ["水", "土"] }),
    ];
    const result = computeTopCandidates(entries);
    // すべて count=1 のタイ → スロット表示順（21-23 → 10-12）、枠内は WEEKDAYS 順
    expect(result.map((c) => [c.slotId, c.weekday])).toEqual([
      ["21-23", "水"],
      ["21-23", "土"],
      ["10-12", "日"],
    ]);
  });

  it("limit 件（デフォルト3）に切り詰める", () => {
    const entries = [
      makeEntry("A", { "21-23": ["月", "火", "水", "木", "金"] }),
    ];
    expect(computeTopCandidates(entries)).toHaveLength(3);
    expect(computeTopCandidates(entries, 5)).toHaveLength(5);
  });

  it("その時間帯で選べない曜日は候補にならない（10-12 は土日のみ）", () => {
    // 平日を持つ壊れたデータが来ても 10-12 の平日候補は作らない
    const entries = [makeEntry("A", { "10-12": ["火", "土"] })];
    const result = computeTopCandidates(entries);
    expect(result).toEqual([
      { slotId: "10-12", weekday: "土", count: 1, total: 1 },
    ]);
  });

  it("全員一致の枠は count === total になる", () => {
    const entries = [
      makeEntry("A", { "21-23": ["月"] }),
      makeEntry("B", { "21-23": ["月"] }),
    ];
    const [top] = computeTopCandidates(entries);
    expect(top.count).toBe(top.total);
  });
});

describe("computeTopCandidates: 週次リセット後の分母", () => {
  /** 名簿にはいるが今週まだ入力していない人 */
  function makePendingEntry(name: string): MemberEntry {
    return {
      name,
      comment: "",
      preferences: buildPreferences(),
      lastEditedAt: "",
      answeredThisWeek: false,
    };
  }

  it("未入力の人は分母に数えない", () => {
    const entries = [
      makeEntry("A", { "21-23": ["月"] }),
      makeEntry("B", { "21-23": ["月"] }),
      makePendingEntry("C"),
      makePendingEntry("D"),
    ];

    const [top] = computeTopCandidates(entries);

    // 名簿は4人だが、今週答えたのは2人。「2／2人が希望」であって「2／4人」ではない
    expect(top.total).toBe(2);
    expect(top.count).toBe(2);
  });

  it("回答した人が全員同じ枠を選べば count === total（全員OK）になる", () => {
    const entries = [
      makeEntry("A", { "21-23": ["月"] }),
      makePendingEntry("B"),
    ];

    const [top] = computeTopCandidates(entries);

    expect(top.count).toBe(top.total);
  });

  it("全員が未入力なら候補は空になる", () => {
    expect(
      computeTopCandidates([makePendingEntry("A"), makePendingEntry("B")]),
    ).toEqual([]);
  });
});

describe("countAnswered", () => {
  it("入力済みの人数と名簿の人数を返す", () => {
    const entries = [
      makeEntry("A", { "21-23": ["月"] }),
      makeEntry("B"),
      {
        name: "C",
        comment: "",
        preferences: buildPreferences(),
        lastEditedAt: "",
        answeredThisWeek: false,
      },
    ];

    // B は曜日ゼロで送信した人。入力はしているので answered に数える
    expect(countAnswered(entries)).toEqual({ answered: 2, total: 3 });
  });

  it("名簿が空なら 0／0 を返す", () => {
    expect(countAnswered([])).toEqual({ answered: 0, total: 0 });
  });
});
