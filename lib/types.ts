// 共有型定義（design.md「型定義（共有）」準拠）

export type SlotId = "21-23" | "10-12";

export type Weekday = "月" | "火" | "水" | "木" | "金" | "土" | "日";

export interface MemberEntry {
  name: string;
  comment: string;
  /** 全 SlotId をキーに持つ。空配列 = その時間帯の希望なし（行なし） */
  preferences: Record<SlotId, Weekday[]>;
  /** updated_at の最大値（ISO 8601）。表示用の導出値。今週の入力がなければ空文字 */
  lastEditedAt: string;
  /**
   * 今週分の入力があるか。false = 名簿にはいるが今週まだ曜日を入れていない人。
   *
   * preferences が全部空かどうかでは代用できない。「曜日をゼロ個で送信した人
   * （＝今週は無理と回答した人）」と「まだ触っていない人」は別物のため。
   */
  answeredThisWeek: boolean;
}
