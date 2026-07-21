import { describe, expect, it } from "vitest";
import { latestEditedAt, planSlotWrites, validateName } from "@/lib/entryRules";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { SlotId, Weekday } from "@/lib/types";

/** 全 SlotId（固定4枠）を TIME_SLOTS から導出する（再定義禁止のため） */
const ALL_SLOT_IDS: SlotId[] = TIME_SLOTS.map((slot) => slot.id);

/** テスト用の preferences を組み立てるヘルパー */
function buildPreferences(
  overrides: Partial<Record<SlotId, Weekday[]>> = {},
): Record<SlotId, Weekday[]> {
  const base: Record<SlotId, Weekday[]> = {
    "19-21": [],
    "21-23": [],
    "8-10": [],
    "10-12": [],
  };
  return { ...base, ...overrides };
}

describe("validateName（2.1, 2.5）", () => {
  it("前後の空白を除去して名前を返す", () => {
    expect(validateName("  とりうみ  ")).toEqual({
      ok: true,
      name: "とりうみ",
    });
  });

  it("通常の名前はそのまま返す", () => {
    expect(validateName("とりうみ")).toEqual({ ok: true, name: "とりうみ" });
  });

  it("空文字は EMPTY_NAME エラーを返す", () => {
    expect(validateName("")).toEqual({ ok: false, error: "EMPTY_NAME" });
  });

  it("空白のみは EMPTY_NAME エラーを返す", () => {
    expect(validateName("   ")).toEqual({ ok: false, error: "EMPTY_NAME" });
    expect(validateName("\t\n ")).toEqual({ ok: false, error: "EMPTY_NAME" });
  });
});

describe("planSlotWrites（2.4）", () => {
  it("空配列の時間帯は deletes に、非空の時間帯は upserts に入る", () => {
    const preferences = buildPreferences({
      "19-21": ["月", "水"],
      "8-10": ["土"],
    });

    const result = planSlotWrites(preferences);

    expect(result.upserts).toEqual([
      { slotId: "19-21", weekdays: ["月", "水"] },
      { slotId: "8-10", weekdays: ["土"] },
    ]);
    expect(result.deletes).toEqual(["21-23", "10-12"]);
  });

  it("不変条件: 全 SlotId が漏れ・重複なくちょうど1回どちらかに割り当てられる", () => {
    const preferences = buildPreferences({
      "21-23": ["火"],
      "10-12": ["金", "日"],
    });

    const { upserts, deletes } = planSlotWrites(preferences);
    const assigned = [...upserts.map((u) => u.slotId), ...deletes];

    // 漏れなし・重複なし（件数が4 かつ 集合として全 SlotId と一致）
    expect(assigned).toHaveLength(ALL_SLOT_IDS.length);
    expect(new Set(assigned)).toEqual(new Set(ALL_SLOT_IDS));
  });

  it("不変条件: weekdays が空配列 ⇔ deletes に入る", () => {
    const preferences = buildPreferences({ "19-21": ["月"] });

    const { upserts, deletes } = planSlotWrites(preferences);

    // upserts 側の weekdays はすべて非空
    for (const upsert of upserts) {
      expect(upsert.weekdays.length).toBeGreaterThan(0);
    }
    // deletes 側は元の preferences で空配列だったものだけ
    for (const slotId of deletes) {
      expect(preferences[slotId]).toEqual([]);
    }
  });

  it("境界: 全時間帯が空なら全て deletes、upserts は空", () => {
    const result = planSlotWrites(buildPreferences());

    expect(result.upserts).toEqual([]);
    expect(new Set(result.deletes)).toEqual(new Set(ALL_SLOT_IDS));
  });

  it("境界: 全時間帯が非空なら全て upserts、deletes は空", () => {
    const preferences = buildPreferences({
      "19-21": ["月"],
      "21-23": ["火"],
      "8-10": ["水"],
      "10-12": ["木"],
    });

    const result = planSlotWrites(preferences);

    expect(result.deletes).toEqual([]);
    expect(new Set(result.upserts.map((u) => u.slotId))).toEqual(
      new Set(ALL_SLOT_IDS),
    );
  });
});

describe("latestEditedAt（1.4）", () => {
  it("複数の ISO 8601 タイムスタンプから最大値を返す", () => {
    const timestamps = [
      "2026-07-20T10:00:00.000Z",
      "2026-07-21T09:30:00.000Z",
      "2026-07-19T23:59:59.000Z",
    ];
    expect(latestEditedAt(timestamps)).toBe("2026-07-21T09:30:00.000Z");
  });

  it("空配列なら null を返す", () => {
    expect(latestEditedAt([])).toBeNull();
  });

  it("1件のみならその値を返す", () => {
    expect(latestEditedAt(["2026-07-21T00:00:00.000Z"])).toBe(
      "2026-07-21T00:00:00.000Z",
    );
  });
});
