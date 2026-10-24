import { getMatrix } from "@/lib/db";
import { getSiteTitle } from "@/lib/siteConfig";
import MatrixPageClient from "./MatrixPageClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const siteTitle = getSiteTitle();
  // 取得だけを try に入れる（JSX は try の外で組まないと描画エラーを捕まえられると誤解させるため）
  const entries = await getMatrix().catch(() => null);
  if (entries) {
    return (
      <div className="page-container">
        <header className="page-header">
          <h1 className="page-title">{siteTitle}</h1>
          <p className="page-subtitle">定例会の希望日時を可視化したやーつ</p>
        </header>
        <MatrixPageClient entries={entries} />
      </div>
    );
  }
  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">{siteTitle}</h1>
        <p className="page-subtitle">定例会の希望日時を1枚で可視化する常設マトリクス表</p>
      </header>
      <div className="section-card">
        <p role="alert" className="form-error">
          データの取得に失敗しました。ページを再読み込みしてください。
        </p>
      </div>
    </div>
  );
}
