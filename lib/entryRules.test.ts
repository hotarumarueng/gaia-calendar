import { describe, expect, it } from "vitest";
import {
  buildMemberEntries,
  buildWriteItems,
  ENTRY_TTL_SECONDS,
  expiresAtFrom,
  latestEditedAt,
  planSlotWrites,
  validateName,
  type StoredItem,
} from "@/lib/entryRules";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { SlotId, Weekday } from "@/lib/types";

/** 全 SlotId（固定2枠）を TIME_SLOTS から導出する（再定義禁止のため） */
const ALL_SLOT_IDS: SlotId[] = TIME_SLOTS.map((slot) => slot.id);

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
      "21-23": ["月", "水"],
    });

    const result = planSlotWrites(preferences);

    expect(result.upserts).toEqual([
      { slotId: "21-23", weekdays: ["月", "水"] },
    ]);
    expect(result.deletes).toEqual(["10-12"]);
  });

  it("不変条件: 全 SlotId が漏れ・重複なくちょうど1回どちらかに割り当てられる", () => {
    const preferences = buildPreferences({
      "21-23": ["火"],
      "10-12": ["土", "日"],
    });

    const { upserts, deletes } = planSlotWrites(preferences);
    const assigned = [...upserts.map((u) => u.slotId), ...deletes];

    // 漏れなし・重複なし（件数が枠数と一致 かつ 集合として全 SlotId と一致）
    expect(assigned).toHaveLength(ALL_SLOT_IDS.length);
    expect(new Set(assigned)).toEqual(new Set(ALL_SLOT_IDS));
  });

  it("不変条件: weekdays が空配列 ⇔ deletes に入る", () => {
    const preferences = buildPreferences({ "21-23": ["月"] });

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
      "21-23": ["火"],
      "10-12": ["土"],
    });

    const result = planSlotWrites(preferences);

    expect(result.deletes).toEqual([]);
    expect(new Set(result.upserts.map((u) => u.slotId))).toEqual(
      new Set(ALL_SLOT_IDS),
    );
  });
});

// ── 週次リセット ──

const THIS_WEEK = "2026-12-07";
const LAST_WEEK = "2026-11-30";

/** テスト用の StoredItem を組み立てる。weekKey を省くとリセット導入前のデータになる */
function item(overrides: Partial<StoredItem> & { sk: string }): StoredItem {
  return {
    name: "とりうみ",
    updatedAt: "2026-12-08T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildMemberEntries（週次リセット）", () => {
  it("weekKey が今週の item は曜日もコメントも反映される", () => {
    const entries = buildMemberEntries(
      [
        item({ sk: "MEMBER", comment: "よろしく", weekKey: THIS_WEEK }),
        item({ sk: "SLOT#21-23", weekdays: ["月", "水"], weekKey: THIS_WEEK }),
      ],
      THIS_WEEK,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      name: "とりうみ",
      comment: "よろしく",
      preferences: { "21-23": ["月", "水"], "10-12": [] },
      lastEditedAt: "2026-12-08T10:00:00.000Z",
      answeredThisWeek: true,
    });
  });

  it("weekKey が先週の item は、名前だけ残して曜日・コメント・最終編集日時が消える", () => {
    const entries = buildMemberEntries(
      [
        item({ sk: "MEMBER", comment: "先週のコメント", weekKey: LAST_WEEK }),
        item({ sk: "SLOT#21-23", weekdays: ["月", "水"], weekKey: LAST_WEEK }),
      ],
      THIS_WEEK,
    );

    expect(entries).toEqual([
      {
        name: "とりうみ",
        comment: "",
        preferences: { "21-23": [], "10-12": [] },
        lastEditedAt: "",
        answeredThisWeek: false,
      },
    ]);
  });

  it("weekKey が無い item（リセット導入前のデータ）も先週以前と同じ扱いになる", () => {
    const entries = buildMemberEntries(
      [
        item({ sk: "MEMBER", comment: "移行前" }),
        item({ sk: "SLOT#21-23", weekdays: ["火"] }),
      ],
      THIS_WEEK,
    );

    expect(entries[0].name).toBe("とりうみ");
    expect(entries[0].comment).toBe("");
    expect(entries[0].preferences["21-23"]).toEqual([]);
    expect(entries[0].answeredThisWeek).toBe(false);
  });

  it("先週の updatedAt が今週のものより新しくても、最終編集日時は今週分だけから決まる", () => {
    const entries = buildMemberEntries(
      [
        item({
          sk: "MEMBER",
          weekKey: THIS_WEEK,
          updatedAt: "2026-12-08T09:00:00.000Z",
        }),
        item({
          sk: "SLOT#21-23",
          weekdays: ["月"],
          // ありえない未来の日付（時計の巻き戻しなど）でも今週分に混ざらないこと
          updatedAt: "2027-01-01T00:00:00.000Z",
          weekKey: LAST_WEEK,
        }),
      ],
      THIS_WEEK,
    );

    expect(entries[0].lastEditedAt).toBe("2026-12-08T09:00:00.000Z");
  });

  it("MEMBER が今週・SLOT が先週なら、コメントは出るが曜日は空になる", () => {
    const entries = buildMemberEntries(
      [
        item({ sk: "MEMBER", comment: "今週のひとこと", weekKey: THIS_WEEK }),
        item({ sk: "SLOT#21-23", weekdays: ["月"], weekKey: LAST_WEEK }),
      ],
      THIS_WEEK,
    );

    expect(entries[0].comment).toBe("今週のひとこと");
    expect(entries[0].preferences["21-23"]).toEqual([]);
    expect(entries[0].answeredThisWeek).toBe(true);
  });

  it("MEMBER が先週・SLOT が今週なら、曜日は出るがコメントは空になる", () => {
    const entries = buildMemberEntries(
      [
        item({ sk: "MEMBER", comment: "先週のひとこと", weekKey: LAST_WEEK }),
        item({ sk: "SLOT#21-23", weekdays: ["木"], weekKey: THIS_WEEK }),
      ],
      THIS_WEEK,
    );

    expect(entries[0].comment).toBe("");
    expect(entries[0].preferences["21-23"]).toEqual(["木"]);
    expect(entries[0].answeredThisWeek).toBe(true);
  });

  it("曜日ゼロで送信した人（今週は無理と回答した人）は未入力と区別できる", () => {
    const [answered] = buildMemberEntries(
      [item({ sk: "MEMBER", weekKey: THIS_WEEK })],
      THIS_WEEK,
    );
    const [notAnswered] = buildMemberEntries(
      [item({ sk: "MEMBER", weekKey: LAST_WEEK })],
      THIS_WEEK,
    );

    // preferences はどちらも空。区別できるのは answeredThisWeek だけ
    expect(answered.preferences).toEqual(notAnswered.preferences);
    expect(answered.answeredThisWeek).toBe(true);
    expect(notAnswered.answeredThisWeek).toBe(false);
  });

  it("今週の item でも廃止済みの時間帯は読み捨てる", () => {
    const entries = buildMemberEntries(
      [item({ sk: "SLOT#19-21", weekdays: ["月"], weekKey: THIS_WEEK })],
      THIS_WEEK,
    );

    expect(entries[0].preferences).toEqual({ "21-23": [], "10-12": [] });
  });

  it("今週の item でもその時間帯で選べない曜日は落とす（10-12 は土日のみ）", () => {
    const entries = buildMemberEntries(
      [
        item({
          sk: "SLOT#10-12",
          weekdays: ["月", "土", "日"],
          weekKey: THIS_WEEK,
        }),
      ],
      THIS_WEEK,
    );

    expect(entries[0].preferences["10-12"]).toEqual(["土", "日"]);
  });

  it("複数人がいても、人ごとに独立して週判定される", () => {
    const entries = buildMemberEntries(
      [
        item({ name: "A", sk: "SLOT#21-23", weekdays: ["月"], weekKey: THIS_WEEK }),
        item({ name: "B", sk: "SLOT#21-23", weekdays: ["火"], weekKey: LAST_WEEK }),
      ],
      THIS_WEEK,
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ name: "A", answeredThisWeek: true });
    expect(entries[1]).toMatchObject({ name: "B", answeredThisWeek: false });
    expect(entries[1].preferences["21-23"]).toEqual([]);
  });

  it("item が空なら空配列を返す", () => {
    expect(buildMemberEntries([], THIS_WEEK)).toEqual([]);
  });
});

describe("buildWriteItems / expiresAtFrom（書き込み時の weekKey と TTL）", () => {
  // JST 2026-12-09（水）12:00 = その週の月曜は 2026-12-07
  const now = new Date(Date.UTC(2026, 11, 9, 3, 0));

  const entry = {
    name: "とりうみ",
    comment: "よろしく",
    preferences: buildPreferences({ "21-23": ["月", "水"] }),
  };

  it("MEMBER・SLOT の両方に、その週の weekKey が入る", () => {
    const { memberItem, slotItems } = buildWriteItems(entry, now);

    expect(memberItem.weekKey).toBe("2026-12-07");
    expect(slotItems).toHaveLength(1);
    expect(slotItems[0].weekKey).toBe("2026-12-07");
  });

  it("MEMBER と SLOT の expiresAt は同じ値になる", () => {
    // ずれると MEMBER だけ先に消え、SLOT item のせいで「名前だけの行」が復活してしまう
    const { memberItem, slotItems } = buildWriteItems(entry, now);

    expect(memberItem.expiresAt).toBe(slotItems[0].expiresAt);
  });

  it("expiresAt はミリ秒ではなく整数の epoch 秒（でないと DynamoDB が TTL を無視する）", () => {
    const { memberItem } = buildWriteItems(entry, now);

    expect(Number.isInteger(memberItem.expiresAt)).toBe(true);
    expect(memberItem.expiresAt).toBe(
      Math.floor(now.getTime() / 1000) + ENTRY_TTL_SECONDS,
    );
    // ミリ秒で書いてしまった場合との取り違えを防ぐ
    expect(memberItem.expiresAt).toBeLessThan(now.getTime());
  });

  it("expiresAtFrom は 30日後を返す", () => {
    expect(expiresAtFrom(now) - Math.floor(now.getTime() / 1000)).toBe(
      60 * 60 * 24 * 30,
    );
  });

  it("空配列の時間帯は書き込まれず、削除キー側に入る", () => {
    const { slotItems, slotDeleteKeys } = buildWriteItems(entry, now);

    expect(slotItems.map((i) => i.sk)).toEqual(["SLOT#21-23"]);
    expect(slotDeleteKeys).toEqual([{ name: "とりうみ", sk: "SLOT#10-12" }]);
  });

  it("全 item の updatedAt が同じ now から導出される", () => {
    const { memberItem, slotItems } = buildWriteItems(entry, now);

    expect(memberItem.updatedAt).toBe(now.toISOString());
    expect(slotItems[0].updatedAt).toBe(now.toISOString());
  });

  it("JST 日曜23:59 と月曜0:00 では weekKey が変わる（書き込み側の週境界）", () => {
    const sunday = new Date(Date.UTC(2026, 11, 6, 14, 59)); // JST 12/6 23:59
    const monday = new Date(Date.UTC(2026, 11, 6, 15, 0)); // JST 12/7 00:00

    expect(buildWriteItems(entry, sunday).memberItem.weekKey).toBe("2026-11-30");
    expect(buildWriteItems(entry, monday).memberItem.weekKey).toBe("2026-12-07");
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
