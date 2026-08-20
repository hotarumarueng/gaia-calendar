import { describe, expect, it } from "vitest";
import {
  formatWeekRangeJp,
  getCurrentWeekKeyJst,
  getCurrentWeekRangeJst,
} from "@/lib/weekRange";

// テスト用ヘルパ: 「JST の Y/M/D H:m」を UTC の Date に変換する
function jst(y: number, m: number, d: number, h = 12, min = 0): Date {
  // JST = UTC+9
  return new Date(Date.UTC(y, m - 1, d, h - 9, min));
}

describe("getCurrentWeekRangeJst", () => {
  it("月曜なら当日を月曜、6日後を日曜として返す", () => {
    const { monday, sunday } = getCurrentWeekRangeJst(jst(2026, 12, 7));
    expect(formatDate(monday)).toBe("2026-12-07");
    expect(formatDate(sunday)).toBe("2026-12-13");
  });

  it("水曜なら直近の月曜と日曜を返す", () => {
    const { monday, sunday } = getCurrentWeekRangeJst(jst(2026, 12, 9));
    expect(formatDate(monday)).toBe("2026-12-07");
    expect(formatDate(sunday)).toBe("2026-12-13");
  });

  it("日曜（週末）なら当日を日曜、6日前を月曜として返す", () => {
    const { monday, sunday } = getCurrentWeekRangeJst(jst(2026, 12, 13));
    expect(formatDate(monday)).toBe("2026-12-07");
    expect(formatDate(sunday)).toBe("2026-12-13");
  });

  it("月曜0時（JST）でも当日が月曜として扱われる", () => {
    const { monday } = getCurrentWeekRangeJst(jst(2026, 12, 7, 0, 0));
    expect(formatDate(monday)).toBe("2026-12-07");
  });

  it("月をまたぐ週（月末→翌月）でも正しく範囲を返す", () => {
    // 2026-11-30 は月曜 → 2026-12-06 が日曜
    const { monday, sunday } = getCurrentWeekRangeJst(jst(2026, 12, 2));
    expect(formatDate(monday)).toBe("2026-11-30");
    expect(formatDate(sunday)).toBe("2026-12-06");
  });

  it("年をまたぐ週でも正しく範囲を返す", () => {
    // 2026-12-31 は木曜 → 月曜は 2026-12-28、日曜は 2027-01-03
    const { monday, sunday } = getCurrentWeekRangeJst(jst(2026, 12, 31));
    expect(formatDate(monday)).toBe("2026-12-28");
    expect(formatDate(sunday)).toBe("2027-01-03");
  });

  it("UTC では前日でも JST が翌日ならその JST 日付基準で計算する", () => {
    // 2026-12-07 00:30 JST は UTC では 2026-12-06 15:30
    // JST 基準では月曜 12/7 なので、月曜=12/7、日曜=12/13 になる
    const utcMoment = new Date(Date.UTC(2026, 11, 6, 15, 30));
    const { monday, sunday } = getCurrentWeekRangeJst(utcMoment);
    expect(formatDate(monday)).toBe("2026-12-07");
    expect(formatDate(sunday)).toBe("2026-12-13");
  });
});

describe("getCurrentWeekKeyJst", () => {
  it("月曜0時（JST）ちょうどなら当日をキーにする", () => {
    expect(getCurrentWeekKeyJst(jst(2026, 12, 7, 0, 0))).toBe("2026-12-07");
  });

  it("同じ週のどの曜日でも同じキーを返す", () => {
    const monday = getCurrentWeekKeyJst(jst(2026, 12, 7));
    expect(getCurrentWeekKeyJst(jst(2026, 12, 9))).toBe(monday);
    expect(getCurrentWeekKeyJst(jst(2026, 12, 13, 23, 59))).toBe(monday);
  });

  it("日曜23:59（JST）と翌月曜0時（JST）で別のキーになる＝ここが週次リセットの境界", () => {
    const lastWeek = getCurrentWeekKeyJst(jst(2026, 12, 6, 23, 59));
    const thisWeek = getCurrentWeekKeyJst(jst(2026, 12, 7, 0, 0));
    expect(lastWeek).toBe("2026-11-30");
    expect(thisWeek).toBe("2026-12-07");
    expect(lastWeek).not.toBe(thisWeek);
  });

  it("UTC では前日でも JST が月曜ならその週のキーを返す", () => {
    // 2026-12-07 00:30 JST = 2026-12-06 15:30 UTC（Vercel は UTC で動く）
    const utcMoment = new Date(Date.UTC(2026, 11, 6, 15, 30));
    expect(getCurrentWeekKeyJst(utcMoment)).toBe("2026-12-07");
  });

  it("月をまたぐ週でも月曜の日付を返す", () => {
    expect(getCurrentWeekKeyJst(jst(2026, 12, 2))).toBe("2026-11-30");
  });

  it("年をまたぐ週でも月曜の日付を返す", () => {
    expect(getCurrentWeekKeyJst(jst(2027, 1, 3))).toBe("2026-12-28");
  });

  it("月日は常にゼロ埋めされた YYYY-MM-DD 形式になる", () => {
    expect(getCurrentWeekKeyJst(jst(2027, 1, 4))).toBe("2027-01-04");
    expect(getCurrentWeekKeyJst(jst(2027, 1, 4))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("どの日付でも getCurrentWeekRangeJst().monday と一致する（週境界の定義がひとつであること）", () => {
    for (let offset = 0; offset < 40; offset += 1) {
      const day = jst(2026, 12, 1 + offset);
      expect(getCurrentWeekKeyJst(day)).toBe(
        formatDate(getCurrentWeekRangeJst(day).monday),
      );
    }
  });
});

describe("formatWeekRangeJp", () => {
  it("M/D（曜）〜M/D（曜）の形式で整形する", () => {
    const range = getCurrentWeekRangeJst(jst(2026, 12, 9));
    expect(formatWeekRangeJp(range)).toBe("12/7（月）〜12/13（日）");
  });

  it("月をまたぐ場合も両方の月日を表示する", () => {
    const range = getCurrentWeekRangeJst(jst(2026, 12, 2));
    expect(formatWeekRangeJp(range)).toBe("11/30（月）〜12/6（日）");
  });
});

// getCurrentWeekRangeJst の返す Date は UTC 上で JST の年月日を表現しているため UTC アクセサで読む
function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
