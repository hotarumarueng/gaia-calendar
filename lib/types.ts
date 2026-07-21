// 共有型定義（design.md「型定義（共有）」準拠）

export type SlotId = "19-21" | "21-23" | "8-10" | "10-12";

export type Weekday = "月" | "火" | "水" | "木" | "金" | "土" | "日";

export interface MemberEntry {
  name: string;
  comment: string;
  /** 全 SlotId をキーに持つ。空配列 = その時間帯の希望なし（行なし） */
  preferences: Record<SlotId, Weekday[]>;
  /** updated_at の最大値（ISO 8601）。表示用の導出値 */
  lastEditedAt: string;
}
