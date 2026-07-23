// JST での「今週」（月曜始まり・日曜終わり）の日付範囲を返す純関数。
// Vercel 実行環境は UTC のため、Intl で JST の年月日を確実に取り出してから曜日を計算する。

export interface WeekRange {
  monday: Date;
  sunday: Date;
}

const JST_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

interface JstParts {
  year: number;
  month: number;
  day: number;
  weekdayIndex: number; // 0=Sun, 1=Mon, ..., 6=Sat
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function toJstParts(date: Date): JstParts {
  const parts = JST_FORMATTER.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekdayIndex: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

export function getCurrentWeekRangeJst(now: Date = new Date()): WeekRange {
  const { year, month, day, weekdayIndex } = toJstParts(now);
  // 月曜=0 になるようにシフト（Sun→6, Mon→0, ..., Sat→5）
  const daysSinceMonday = (weekdayIndex + 6) % 7;

  // JST の年月日を UTC で表現した Date を作り、そこから日数加減する
  // （タイムゾーンをまたぐズレを避けるため UTC 上で計算する）
  const base = new Date(Date.UTC(year, month - 1, day));
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - daysSinceMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return { monday, sunday };
}

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"] as const;

// getCurrentWeekRangeJst の返す Date は UTC 上の年月日で「JST の月曜/日曜」を表しているため
// UTC アクセサ（getUTC*）で読み出す。ローカル時刻アクセサを使うとサーバの TZ に引きずられる。
export function formatWeekRangeJp(range: WeekRange): string {
  const format = (d: Date) => {
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const w = WEEKDAY_JP[d.getUTCDay()];
    return `${m}/${day}（${w}）`;
  };
  return `${format(range.monday)}〜${format(range.sunday)}`;
}
