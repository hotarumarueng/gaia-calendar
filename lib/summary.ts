// 「今週集まれそうな時間/曜日」サマリーの集計ロジック（純関数）

import { TIME_SLOTS, WEEKDAYS } from "./timeSlots";
import type { MemberEntry, SlotId, Weekday } from "./types";

export interface SlotCandidate {
  slotId: SlotId;
  weekday: Weekday;
  /** その枠に○をつけた人数 */
  count: number;
  /** 全メンバー数 */
  total: number;
}

/**
 * 各 slot × weekday に○をつけた人数を集計し、count 降順で上位 limit 件を返す。
 * 同数タイは TIME_SLOTS 順 → WEEKDAYS 順で安定させる。count 0 の枠は含めない。
 */
export function computeTopCandidates(
  entries: MemberEntry[],
  limit = 3,
): SlotCandidate[] {
  const total = entries.length;
  if (total === 0) return [];

  const candidates: SlotCandidate[] = [];
  for (const slot of TIME_SLOTS) {
    for (const weekday of WEEKDAYS) {
      const count = entries.filter((entry) =>
        entry.preferences[slot.id].includes(weekday),
      ).length;
      if (count > 0) {
        candidates.push({ slotId: slot.id, weekday, count, total });
      }
    }
  }

  // sort は安定ソートなので、同数タイは push 順（TIME_SLOTS → WEEKDAYS）が保たれる
  candidates.sort((a, b) => b.count - a.count);
  return candidates.slice(0, limit);
}
