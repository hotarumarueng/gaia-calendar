import { TIME_SLOTS } from "@/lib/timeSlots";

// プレースホルダページ。マトリクス表・入力フォームはタスク4.1で統合する
export default function Home() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>gaia-calendar</h1>
      <p>定例会の希望日時を1枚で可視化する常設マトリクス表（準備中）</p>
      <ul>
        {TIME_SLOTS.map((slot) => (
          <li key={slot.id}>{slot.label}</li>
        ))}
      </ul>
    </main>
  );
}
