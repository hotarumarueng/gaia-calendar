/**
 * 本人名のブラウザ記憶ユーティリティ（要件 3.1-3.3 / design.md「identity」）
 *
 * - localStorage キー `gaia-calendar:name` に trim 後の名前を保持する（ブラウザ単位）
 * - サーバーサイド（window 未定義）では save/clear は no-op、get は null を返す
 * - localStorage が使えない環境（プライベートモード等）でもクラッシュしない
 */

const STORAGE_KEY = "gaia-calendar:name";

/** 名前を trim して localStorage に保存する。保存できない環境では何もしない */
export function saveMyName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, name.trim());
  } catch {
    // localStorage が無効な環境（プライベートモード・容量超過等）では記憶を諦める。
    // 本人確認は「見せ方」の補助機能であり、保存失敗でアプリを止めない（要件 3 の位置づけ）
  }
}

/** 記憶された名前を返す。未保存・サーバーサイド・取得不能時は null */
export function getMyName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** 記憶された名前を削除する。削除できない環境では何もしない */
export function clearMyName(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // saveMyName と同じ理由で no-op
  }
}
