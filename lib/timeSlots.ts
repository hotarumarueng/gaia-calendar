import type { SlotId, Weekday } from "./types";

/** 固定4時間帯（表示順）。id は SlotId と厳密一致 */
export const TIME_SLOTS = [
  { id: "19-21", label: "19:00-21:00" },
  { id: "21-23", label: "21:00-23:00" },
  { id: "8-10", label: "8:00-10:00" },
  { id: "10-12", label: "10:00-12:00" },
] as const satisfies readonly { id: SlotId; label: string }[];

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
