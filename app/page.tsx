import { getMatrix } from "@/lib/db";
import MatrixPageClient from "./MatrixPageClient";

export default async function Home() {
  try {
    const entries = await getMatrix();
    return (
      <main style={{ padding: "2rem" }}>
        <h1>ガイアカレンダー</h1>
        <p>定例会の希望日時を1枚で可視化する常設マトリクス表</p>
        <MatrixPageClient entries={entries} />
      </main>
    );
  } catch {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>ガイアカレンダー</h1>
        <p role="alert">
          データの取得に失敗しました。ページを再読み込みしてください。
        </p>
      </main>
    );
  }
}
