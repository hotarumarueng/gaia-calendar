// 「今週集まれそうな時間/曜日」サマリーの集計ロジック（純関数）

import { TIME_SLOTS } from "./timeSlots";
import type { MemberEntry, SlotId, Weekday } from "./types";

export interface SlotCandidate {
  slotId: SlotId;
  weekday: Weekday;
  /** その枠に○をつけた人数 */
  count: number;
  /** 今週回答した人数 */
  total: number;
}

/** 今週の回答状況。answered = 入力済みの人数、total = 名簿にいる人数 */
export function countAnswered(entries: MemberEntry[]): {
  answered: number;
  total: number;
} {
  return {
    answered: entries.filter((entry) => entry.answeredThisWeek).length,
    total: entries.length,
  };
}

/**
 * 各 slot × weekday に○をつけた人数を集計し、count 降順で上位 limit 件を返す。
 * 同数タイは TIME_SLOTS 順 → WEEKDAYS 順で安定させる。count 0 の枠は含めない。
 *
 * 分母は「今週回答した人」だけ。週次リセット後の名簿には未入力の人も並ぶが、
 * その人たちは「その枠を希望していない」わけではないので数えない
 * （呼び出し側でのフィルタ忘れを防ぐため、絞り込みはこの関数の中に閉じてある）
 */
export function computeTopCandidates(
  entries: MemberEntry[],
  limit = 3,
): SlotCandidate[] {
  const answered = entries.filter((entry) => entry.answeredThisWeek);
  const total = answered.length;
  if (total === 0) return [];

  const candidates: SlotCandidate[] = [];
  for (const slot of TIME_SLOTS) {
    // その時間帯で選べる曜日だけを候補にする（例: 10-12 は土日のみ）
    for (const weekday of slot.weekdays) {
      const count = answered.filter((entry) =>
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
