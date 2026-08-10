import type { SlotId, Weekday } from "./types";

/** 曜日（表示順） */
export const WEEKDAYS = [
  "月",
  "火",
  "水",
  "木",
  "金",
  "土",
  "日",
] as const satisfies readonly Weekday[];

/**
 * 固定2時間帯（表示順）。id は SlotId と厳密一致。
 *
 * weekdays = その時間帯で選べる曜日。フォーム・API 検証・集計・可視化グリッドは
 * すべてこの定義を唯一の正として参照する（ここを変えれば全部が追従する）。
 */
export const TIME_SLOTS = [
  { id: "21-23", label: "21:00-23:00", weekdays: WEEKDAYS },
  { id: "10-12", label: "10:00-12:00", weekdays: ["土", "日"] },
] as const satisfies readonly {
  id: SlotId;
  label: string;
  weekdays: readonly Weekday[];
}[];

/** その時間帯で選べる曜日。未知の slotId には空配列を返す */
export function slotWeekdays(slotId: SlotId): readonly Weekday[] {
  return TIME_SLOTS.find((slot) => slot.id === slotId)?.weekdays ?? [];
}
