import type { Metadata } from "next";
import "./globals.css";
import { getSiteTitle } from "@/lib/siteConfig";

// タイトルは環境変数で差し替えるため、ビルド時に固定される static metadata ではなく
// リクエストごとに評価される generateMetadata を使う
export function generateMetadata(): Metadata {
  return {
    title: getSiteTitle(),
    description: "定例会の希望日時を1枚で可視化する常設マトリクス表",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
