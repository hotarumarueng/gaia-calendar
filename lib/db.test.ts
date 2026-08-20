// db.ts の統合テスト（実 DynamoDB テーブルに対して実行する）
// design.md「db.ts」Service Interface（getMatrix/upsertEntry/deleteEntry）に対応
// 要件 2.2（同名同時間帯は上書き）, 2.3（永続化）, 5.1（人単位削除）を検証する

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteEntry, getMatrix, upsertEntry } from "@/lib/db";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { SlotId, Weekday } from "@/lib/types";

/** 全 SlotId（固定2枠）を TIME_SLOTS から導出する（再定義禁止のため） */
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
        "21-23": ["月", "水"],
        "10-12": ["土"],
      }),
    });

    const matrix = await getMatrix();
    const entry = matrix.find((e) => e.name === TEST_NAME);

    expect(entry).toBeDefined();
    expect(entry?.comment).toBe("テスト中です");
    expect(entry?.preferences).toEqual(
      buildPreferences({
        "21-23": ["月", "水"],
        "10-12": ["土"],
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
        "10-12": [], // 前回は非空だった枠を空にする → 削除されて空欄に戻るはず
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

// 週判定の分岐そのものは entryRules.test.ts が網羅している。
// ここでは「書き込んだ weekKey が実テーブルを往復して効くか」だけを確かめる
describe("db.ts（週次リセットが実テーブル越しに効くか）", () => {
  const WEEKLY_TEST_NAME = `__test_db_weekly__${Date.now()}`;

  // JST 2026-12-09（水） … 週は 12/7 始まり
  const thisWeek = new Date(Date.UTC(2026, 11, 9, 3, 0));
  // その1週間前 … 週は 11/30 始まり
  const lastWeek = new Date(Date.UTC(2026, 11, 2, 3, 0));

  beforeAll(async () => {
    await deleteEntry(WEEKLY_TEST_NAME);
  });

  afterAll(async () => {
    await deleteEntry(WEEKLY_TEST_NAME);
  });

  it("先週保存した希望は、今週から見ると名前だけ残って曜日とコメントが消える", async () => {
    await upsertEntry(
      {
        name: WEEKLY_TEST_NAME,
        comment: "先週のコメント",
        preferences: buildPreferences({ "21-23": ["月", "水"], "10-12": ["土"] }),
      },
      lastWeek,
    );

    const entry = (await getMatrix(thisWeek)).find(
      (e) => e.name === WEEKLY_TEST_NAME,
    );

    expect(entry).toBeDefined();
    expect(entry?.comment).toBe("");
    expect(entry?.preferences).toEqual(buildPreferences());
    expect(entry?.lastEditedAt).toBe("");
    expect(entry?.answeredThisWeek).toBe(false);
  });

  it("同じデータでも、その週から見れば曜日もコメントも出る", async () => {
    const entry = (await getMatrix(lastWeek)).find(
      (e) => e.name === WEEKLY_TEST_NAME,
    );

    expect(entry?.comment).toBe("先週のコメント");
    expect(entry?.preferences).toEqual(
      buildPreferences({ "21-23": ["月", "水"], "10-12": ["土"] }),
    );
    expect(entry?.answeredThisWeek).toBe(true);
  });

  it("今週入れ直すと復活し、行は増えず、前週だけにあった枠は空のままになる", async () => {
    await upsertEntry(
      {
        name: WEEKLY_TEST_NAME,
        comment: "今週のコメント",
        preferences: buildPreferences({ "21-23": ["火"] }),
      },
      thisWeek,
    );

    const matching = (await getMatrix(thisWeek)).filter(
      (e) => e.name === WEEKLY_TEST_NAME,
    );

    expect(matching).toHaveLength(1);
    expect(matching[0].comment).toBe("今週のコメント");
    // 10-12 は先週入れたきり今週は空 → planSlotWrites の DELETE で物理的にも消えている
    expect(matching[0].preferences).toEqual(
      buildPreferences({ "21-23": ["火"] }),
    );
    expect(matching[0].answeredThisWeek).toBe(true);
  });

  it("deleteEntry は古い週の item も含めて消す", async () => {
    await upsertEntry(
      {
        name: WEEKLY_TEST_NAME,
        comment: "先週のぶん",
        preferences: buildPreferences({ "10-12": ["日"] }),
      },
      lastWeek,
    );

    await deleteEntry(WEEKLY_TEST_NAME);

    // どの週から見ても残っていないこと
    expect(
      (await getMatrix(thisWeek)).find((e) => e.name === WEEKLY_TEST_NAME),
    ).toBeUndefined();
    expect(
      (await getMatrix(lastWeek)).find((e) => e.name === WEEKLY_TEST_NAME),
    ).toBeUndefined();
  });
});
