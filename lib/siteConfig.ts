// サイトの表示名。環境ごとに変えたいのでコードに直書きせず環境変数から読む。
//
// 未設定なら既定値を使う（ローカル開発・クローンした環境ではこちらになる）。
// 本番の表示名は Vercel の環境変数 SITE_TITLE で与える。
// NEXT_PUBLIC_ を付けないのは、Server Component からしか参照しないため
// （クライアントバンドルに埋め込ませない）。

const DEFAULT_SITE_TITLE = "Gaia カレンダー";

/** サイトの表示名を返す。リクエストごとに評価されるよう関数にしている */
export function getSiteTitle(): string {
  const value = process.env.SITE_TITLE?.trim();
  return value ? value : DEFAULT_SITE_TITLE;
}
