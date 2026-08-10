import { describe, expect, it } from "vitest";
// パスエイリアス @/ の解決確認を兼ねて相対 import ではなくエイリアスで import する
import { TIME_SLOTS, WEEKDAYS, slotWeekdays } from "@/lib/timeSlots";
import type { SlotId, Weekday } from "@/lib/types";

describe("timeSlots 定数（テスト基盤の動作確認）", () => {
  it("TIME_SLOTS は固定2枠で、id が SlotId 全種と一致する", () => {
    const expectedSlotIds: SlotId[] = ["21-23", "10-12"];
    expect(TIME_SLOTS).toHaveLength(2);
    expect(TIME_SLOTS.map((slot) => slot.id)).toEqual(expectedSlotIds);
  });

  it("WEEKDAYS は7曜日で、Weekday 全種と一致する", () => {
    const expectedWeekdays: Weekday[] = ["月", "火", "水", "木", "金", "土", "日"];
    expect(WEEKDAYS).toHaveLength(7);
    expect([...WEEKDAYS]).toEqual(expectedWeekdays);
  });

  it("21:00-23:00 は全曜日、10:00-12:00 は土日だけ選べる", () => {
    expect([...slotWeekdays("21-23")]).toEqual([
      "月",
      "火",
      "水",
      "木",
      "金",
      "土",
      "日",
    ]);
    expect([...slotWeekdays("10-12")]).toEqual(["土", "日"]);
  });

  it("各枠の weekdays は WEEKDAYS の並び順の部分列になっている", () => {
    for (const slot of TIME_SLOTS) {
      const positions = slot.weekdays.map((weekday) =>
        WEEKDAYS.indexOf(weekday),
      );
      expect(positions).not.toContain(-1);
      expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
    }
  });
});
