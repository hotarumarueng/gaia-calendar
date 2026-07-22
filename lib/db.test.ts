// db.ts の統合テスト（実 DynamoDB テーブルに対して実行する）
// design.md「db.ts」Service Interface（getMatrix/upsertEntry/deleteEntry）に対応
// 要件 2.2（同名同時間帯は上書き）, 2.3（永続化）, 5.1（人単位削除）を検証する

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteEntry, getMatrix, upsertEntry } from "@/lib/db";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { SlotId, Weekday } from "@/lib/types";

/** 全 SlotId（固定4枠）を TIME_SLOTS から導出する（再定義禁止のため） */
const ALL_SLOT_IDS: SlotId[] = TIME_SLOTS.map((slot) => slot.id);

/** テスト用の preferences を組み立てるヘルパー（未指定の枠は空配列で補完） */
function buildPreferences(
  overrides: Partial<Record<SlotId, Weekday[]>> = {},
): Record<SlotId, Weekday[]> {
  const base = {} as Record<SlotId, Weekday[]>;
  for (const slotId of ALL_SLOT_IDS) {
    base[slotId] = [];
  }
  return { ...base, ...overrides };
}

// 他の開発者・後続タスクのデータと衝突しないユニークな名前を使う
const TEST_NAME = `__test_db_ts__${Date.now()}`;

describe("db.ts（実 DynamoDB テーブルに対する統合テスト）", () => {
  // 途中で assertion が落ちてもテーブルにゴミが残らないよう、事前後の両方で確実に削除する
  beforeAll(async () => {
    await deleteEntry(TEST_NAME);
  });

  afterAll(async () => {
    await deleteEntry(TEST_NAME);
  });

  it("保存前は getMatrix に現れない", async () => {
    const matrix = await getMatrix();
    expect(matrix.find((entry) => entry.name === TEST_NAME)).toBeUndefined();
  });

  it("upsertEntry で保存した内容が getMatrix に反映される（2.2, 2.3）", async () => {
    await upsertEntry({
      name: TEST_NAME,
      comment: "テスト中です",
      preferences: buildPreferences({
        "19-21": ["月", "水"],
        "8-10": ["土"],
      }),
    });

    const matrix = await getMatrix();
    const entry = matrix.find((e) => e.name === TEST_NAME);

    expect(entry).toBeDefined();
    expect(entry?.comment).toBe("テスト中です");
    expect(entry?.preferences).toEqual(
      buildPreferences({
        "19-21": ["月", "水"],
        "8-10": ["土"],
      }),
    );
    expect(entry?.lastEditedAt).toEqual(expect.any(String));
    expect(entry?.lastEditedAt.length).toBeGreaterThan(0);
  });

  it("同じ名前で再保存すると行が増えず上書きされ、空配列にした時間帯はセルが空欄に戻る（2.2, 2.4）", async () => {
    await upsertEntry({
      name: TEST_NAME,
      comment: "更新後のコメント",
      preferences: buildPreferences({
        "19-21": [], // 前回は非空だった枠を空にする → 削除されて空欄に戻るはず
        "21-23": ["火"],
      }),
    });

    const matrix = await getMatrix();
    const matchingEntries = matrix.filter((e) => e.name === TEST_NAME);

    // 行が増えていない（上書きされている）
    expect(matchingEntries).toHaveLength(1);

    const entry = matchingEntries[0];
    expect(entry.comment).toBe("更新後のコメント");
    expect(entry.preferences).toEqual(
      buildPreferences({
        "21-23": ["火"],
      }),
    );
  });

  it("deleteEntry で人単位の全データが削除される（5.1）", async () => {
    await deleteEntry(TEST_NAME);

    const matrix = await getMatrix();
    expect(matrix.find((e) => e.name === TEST_NAME)).toBeUndefined();
  });
});
