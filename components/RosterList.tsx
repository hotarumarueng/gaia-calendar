"use client";

/**
 * みんなの回答状況リスト
 *
 * 旧マトリクス表（縦=名前 × 横=時間帯）の代わりに、
 * 「誰が・何をコメントし・いつ更新したか」を1人1行で並べる。
 * 希望曜日そのものは ScheduleSummary の候補カード側で見せる。
 */

import { useEffect, useState } from "react";
import { getMyName } from "@/lib/identity";
import { buildPersonColors } from "@/lib/personColor";
import type { MemberEntry } from "@/lib/types";

interface RosterListProps {
  entries: MemberEntry[];
  onEdit?: (entry: MemberEntry) => void;
  onDelete?: (name: string) => void;
}

// SSR（UTC）とブラウザ（JST）で表示が食い違わないよう、必ず JST で整形する
const JST_LAST_EDITED_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatLastEditedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = JST_LAST_EDITED_FORMATTER.formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  // "24:00" ケースを "0:00" に寄せる（hour12:false でも一部環境で 24 が出るため）
  const hour = get("hour") === "24" ? "0" : get("hour");
  return `${get("month")}/${get("day")} ${hour}:${get("minute")}`;
}

export default function RosterList({ entries, onEdit, onDelete }: RosterListProps) {
  const [myName, setMyName] = useState<string | null>(null);
  useEffect(() => {
    setMyName(getMyName());
  }, []);

  if (entries.length === 0) {
    return (
      <p className="roster-empty">
        まだ誰も入力していません。<br />
        上のフォームから名前と希望曜日を送ると、ここに並びます。
      </p>
    );
  }

  const personColors = buildPersonColors(entries.map((entry) => entry.name));

  return (
    <ul className="roster">
      {entries.map((entry) => {
        const isMine = myName !== null && myName === entry.name;
        return (
          <li
            key={entry.name}
            className="roster-row"
            data-mine={isMine ? "" : undefined}
            data-pending={entry.answeredThisWeek ? undefined : ""}
            style={{ backgroundColor: personColors.get(entry.name) }}
          >
            <div className="roster-main">
              <span className="roster-name">{entry.name}</span>
              {/* 週が変わると曜日とコメントは消えるので、コメント欄の位置に未入力を出す */}
              {!entry.answeredThisWeek && (
                <span className="roster-pending">未入力</span>
              )}
              {entry.comment && (
                <span className="roster-comment">{entry.comment}</span>
              )}
            </div>
            <div className="roster-side">
              <span className="roster-time">
                {formatLastEditedAt(entry.lastEditedAt)}
              </span>
              {isMine && (
                <span className="roster-actions">
                  <button type="button" onClick={() => onEdit?.(entry)}>編集</button>
                  <button type="button" onClick={() => onDelete?.(entry.name)}>削除</button>
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
