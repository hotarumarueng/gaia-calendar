import { describe, expect, it } from "vitest";
import { computeTopCandidates } from "@/lib/summary";
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
