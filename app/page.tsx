import { getMatrix } from "@/lib/db";
import MatrixPageClient from "./MatrixPageClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const entries = await getMatrix();
    return (
      <div className="page-container">
        <header className="page-header">
          <h1 className="page-title">Gaia（仮）カレンダー</h1>
          <p className="page-subtitle">定例会の希望日時を可視化したやーつ</p>
        </header>
        <MatrixPageClient entries={entries} />
      </div>
    );
  } catch {
    return (
      <div className="page-container">
        <header className="page-header">
          <h1 className="page-title">Gaia（仮）カレンダー</h1>
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
}
