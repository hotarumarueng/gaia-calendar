// 整合性ルールの純粋関数群（design.md「entryRules」準拠）
// DB 非依存に保つことで、接続なしで単体テストできるようにする

import { TIME_SLOTS } from "./timeSlots";
import type { SlotId, Weekday } from "./types";

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
