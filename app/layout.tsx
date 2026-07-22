import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gaia（仮）カレンダー",
  description: "定例会の希望日時を1枚で可視化する常設マトリクス表",
};

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
