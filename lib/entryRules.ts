// 整合性ルールの純粋関数群（design.md「entryRules」準拠）
// DB 非依存に保つことで、接続なしで単体テストできるようにする。
// db.ts は「Scan して渡す・Put/Delete する」だけの薄い層で、判断はすべてここにある。

import { TIME_SLOTS } from "./timeSlots";
import type { MemberEntry, SlotId, Weekday } from "./types";
import { getCurrentWeekKeyJst } from "./weekRange";

/** Member item の SK 固定値（tech.md / infra/dynamodb-setup.md 準拠） */
export const MEMBER_SK = "MEMBER";
export const SLOT_SK_PREFIX = "SLOT#";

export function slotSk(slotId: SlotId): string {
  return `${SLOT_SK_PREFIX}${slotId}`;
}

const SLOT_ID_SET: ReadonlySet<string> = new Set(
  TIME_SLOTS.map((slot) => slot.id),
);
export function isSlotId(value: string): value is SlotId {
  return SLOT_ID_SET.has(value);
}

/**
 * 時間帯ごとに選べる曜日が違う（例: 10-12 は土日のみ）。
 * 廃止した時間帯の item や、範囲外の曜日を含む古い item は読み捨てる
 * ＝ 移行スクリプトなしで表示を新しい定義に揃える
 */
export const ALLOWED_WEEKDAYS_BY_SLOT: ReadonlyMap<
  SlotId,
  ReadonlySet<string>
> = new Map(TIME_SLOTS.map((slot) => [slot.id, new Set<string>(slot.weekdays)]));

/** upsertEntry に渡す検証済みデータ（MemberEntry から表示用の導出値を除いたもの） */
export type ValidatedEntry = {
  name: string;
  comment: string;
  preferences: Record<SlotId, Weekday[]>;
};

/** 名前を trim し、空なら invalid を返す（要件 2.1, 2.5） */
export function validateName(
  raw: string,
): { ok: true; name: string } | { ok: false; error: "EMPTY_NAME" } {
  const name = raw.trim();
  if (name === "") {
    return { ok: false, error: "EMPTY_NAME" };
  }
  return { ok: true, name };
}

/**
 * 時間帯ごとの希望を upsert 対象と delete 対象に振り分ける（要件 2.4）
 * - Postcondition: 全 SlotId をちょうど1回、upserts か deletes のどちらかに割り当てる
 * - Invariant: weekdays が空配列 ⇔ deletes に入る
 */
export function planSlotWrites(preferences: Record<SlotId, Weekday[]>): {
  upserts: { slotId: SlotId; weekdays: Weekday[] }[];
  deletes: SlotId[];
} {
  const upserts: { slotId: SlotId; weekdays: Weekday[] }[] = [];
  const deletes: SlotId[] = [];

  // TIME_SLOTS を走査することで、全 SlotId がちょうど1回振り分けられることを保証する
  for (const { id } of TIME_SLOTS) {
    const weekdays = preferences[id];
    if (weekdays.length === 0) {
      deletes.push(id);
    } else {
      upserts.push({ slotId: id, weekdays });
    }
  }

  return { upserts, deletes };
}

/** メンバーの updated_at 群から最終編集日時（最大値）を返す。空なら null（要件 1.4） */
export function latestEditedAt(timestamps: string[]): string | null {
  if (timestamps.length === 0) {
    return null;
  }
  // ISO 8601（同一タイムゾーン表記）は辞書順比較で時刻順と一致する
  return timestamps.reduce((max, current) => (current > max ? current : max));
}

// ──────────────────────────────────────────────
// 週次リセット（weekKey による論理判定）
//
// cron もバッチも使わない。書き込むときに「どの週のものか」を item に刻み、
// 読むときに今週のものだけを採用する。これだけでリセットが成立する。
// ──────────────────────────────────────────────

/** DynamoDB から読んだ item のうち、このアプリが書いた形のもの */
export interface StoredItem {
  name: string;
  sk: string;
  comment?: string;
  weekdays?: string[];
  updatedAt: string;
  /** 週次リセット導入前に書かれた item には存在しないので optional */
  weekKey?: string;
}

/**
 * item 群を人単位の MemberEntry に組み立てる。
 *
 * weekKey が currentWeekKey と一致しない item は「先週以前のもの」として扱い、
 * SLOT item は丸ごと無視し、MEMBER item は名前だけ残して comment を捨てる。
 * weekKey が無い item（リセット導入前のデータ）は undefined === string が false になるので、
 * 追加の分岐なしで「古い週」に倒れる。
 */
export function buildMemberEntries(
  items: StoredItem[],
  currentWeekKey: string,
): MemberEntry[] {
  const itemsByName = new Map<string, StoredItem[]>();
  for (const item of items) {
    const group = itemsByName.get(item.name) ?? [];
    group.push(item);
    itemsByName.set(item.name, group);
  }

  const entries: MemberEntry[] = [];
  for (const [name, group] of itemsByName) {
    const preferences = buildEmptyPreferences();
    let comment = "";
    let answeredThisWeek = false;
    const timestamps: string[] = [];

    for (const item of group) {
      // 先週以前の item は最終編集日時にも数えない（未入力の人の時刻欄を空にするのはここ）
      if (item.weekKey !== currentWeekKey) {
        continue;
      }
      answeredThisWeek = true;
      timestamps.push(item.updatedAt);

      if (item.sk === MEMBER_SK) {
        comment = item.comment ?? "";
      } else if (item.sk.startsWith(SLOT_SK_PREFIX)) {
        const slotId = item.sk.slice(SLOT_SK_PREFIX.length);
        if (isSlotId(slotId)) {
          const allowed = ALLOWED_WEEKDAYS_BY_SLOT.get(slotId);
          preferences[slotId] = (item.weekdays ?? []).filter(
            (weekday): weekday is Weekday => allowed?.has(weekday) === true,
          );
        }
      }
    }

    // 今週の item が1つも無くても entry は返す = 名前だけが名簿に残る（週次リセットの狙い）
    entries.push({
      name,
      comment,
      preferences,
      lastEditedAt: latestEditedAt(timestamps) ?? "",
      answeredThisWeek,
    });
  }

  return entries;
}

/** preferences の初期値。全 SlotId を空配列で補完する（未入力時間帯の一義化） */
function buildEmptyPreferences(): Record<SlotId, Weekday[]> {
  const preferences = {} as Record<SlotId, Weekday[]>;
  for (const { id } of TIME_SLOTS) {
    preferences[id] = [];
  }
  return preferences;
}

/**
 * item の生存期間（30日）。
 * 週次リセットは weekKey が担うので、これはリセットの仕組みではなく
 * 「もう来なくなった人を名簿から掃除する」ためのもの。
 */
export const ENTRY_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * DynamoDB の TTL 属性に入れる値。
 * epoch "秒" の整数でなければならない。ミリ秒や小数、文字列だと
 * DynamoDB はエラーを出さずに TTL を無視する。
 */
export function expiresAtFrom(now: Date): number {
  return Math.floor(now.getTime() / 1000) + ENTRY_TTL_SECONDS;
}

export interface MemberItem {
  name: string;
  sk: string;
  comment: string;
  updatedAt: string;
  weekKey: string;
  expiresAt: number;
}

export interface SlotItem {
  name: string;
  sk: string;
  weekdays: Weekday[];
  updatedAt: string;
  weekKey: string;
  expiresAt: number;
}

/**
 * upsertEntry が書き込む内容を決める（DB は呼ばない）。
 * MEMBER と SLOT の expiresAt は必ず同じ値にする。MEMBER だけ先に消えると、
 * 残った SLOT item のせいで「名前だけ・コメントなし」の行が復活してしまう。
 */
export function buildWriteItems(
  entry: ValidatedEntry,
  now: Date,
): {
  memberItem: MemberItem;
  slotItems: SlotItem[];
  slotDeleteKeys: { name: string; sk: string }[];
} {
  const updatedAt = now.toISOString();
  const weekKey = getCurrentWeekKeyJst(now);
  const expiresAt = expiresAtFrom(now);
  const { upserts, deletes } = planSlotWrites(entry.preferences);

  return {
    memberItem: {
      name: entry.name,
      sk: MEMBER_SK,
      comment: entry.comment,
      updatedAt,
      weekKey,
      expiresAt,
    },
    slotItems: upserts.map(({ slotId, weekdays }) => ({
      name: entry.name,
      sk: slotSk(slotId),
      weekdays,
      updatedAt,
      weekKey,
      expiresAt,
    })),
    slotDeleteKeys: deletes.map((slotId) => ({
      name: entry.name,
      sk: slotSk(slotId),
    })),
  };
}
