// 人ごとの識別色（モックのパレット）
//
// モックの配色システムは「色＝人」。時間帯は位置とラベルで区別し、色は使わない。
// 5色はすべて同じ明度帯に揃えてあり、濃紺 #001858 のインクに対して最低 6.8:1 を確保する。

export const PERSON_COLORS = [
  "#8bd3dd", // ミント
  "#f3d2c1", // ピーチ
  "#f582ae", // ピンク
  "#c7d0ea", // ペリウィンクル
  "#fdeac2", // イエロー
] as const;

/**
 * 名前 → 色 の対応を作る。
 *
 * 名前でソートした順に割り当てるので、
 * - DynamoDB の Scan 順に依存しない（再読み込みで色が入れ替わらない）
 * - 5人までは必ず全員違う色になる
 * 6人目以降は先頭から色を使い回す。
 */
export function buildPersonColors(names: string[]): Map<string, string> {
  const sorted = [...names].sort();
  return new Map(
    sorted.map((name, index) => [
      name,
      PERSON_COLORS[index % PERSON_COLORS.length],
    ]),
  );
}
