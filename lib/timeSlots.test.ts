import { describe, expect, it } from "vitest";
// パスエイリアス @/ の解決確認を兼ねて相対 import ではなくエイリアスで import する
import { TIME_SLOTS, WEEKDAYS } from "@/lib/timeSlots";
import type { SlotId, Weekday } from "@/lib/types";

describe("timeSlots 定数（テスト基盤の動作確認）", () => {
  it("TIME_SLOTS は固定4枠で、id が SlotId 全種と一致する", () => {
    const expectedSlotIds: SlotId[] = ["19-21", "21-23", "8-10", "10-12"];
    expect(TIME_SLOTS).toHaveLength(4);
    expect(TIME_SLOTS.map((slot) => slot.id)).toEqual(expectedSlotIds);
  });

  it("WEEKDAYS は7曜日で、Weekday 全種と一致する", () => {
    const expectedWeekdays: Weekday[] = ["月", "火", "水", "木", "金", "土", "日"];
    expect(WEEKDAYS).toHaveLength(7);
    expect([...WEEKDAYS]).toEqual(expectedWeekdays);
  });
});
