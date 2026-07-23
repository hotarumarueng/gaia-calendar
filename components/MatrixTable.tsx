"use client";

import { useEffect, useState } from "react";
import { getMyName } from "@/lib/identity";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { MemberEntry } from "@/lib/types";

interface MatrixTableProps {
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

export default function MatrixTable({ entries, onEdit, onDelete }: MatrixTableProps) {
  const [myName, setMyName] = useState<string | null>(null);
  useEffect(() => {
    setMyName(getMyName());
  }, []);

  if (entries.length === 0) {
    return (
      <p className="matrix-empty">
        まだ誰も入力していません。<br />
        下のフォームから名前と希望曜日を登録すると、ここに表が表示されます。
      </p>
    );
  }

  return (
    <div className="matrix-wrap">
      <table className="matrix-table">
        <thead>
          <tr>
            <th scope="col" className="matrix-name-col">名前</th>
            {TIME_SLOTS.map((slot) => (
              <th scope="col" key={slot.id}>{slot.label}</th>
            ))}
            <th scope="col">コメント</th>
            <th scope="col">最終編集</th>
            <th scope="col">
              <span className="visually-hidden">操作</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isMine = myName !== null && myName === entry.name;
            return (
              <tr key={entry.name}>
                <th scope="row" className="matrix-name-col">{entry.name}</th>
                {TIME_SLOTS.map((slot) => {
                  const weekdays = entry.preferences[slot.id];
                  return (
                    <td key={slot.id} className="slot-cell">
                      {weekdays.length > 0 && (
                        <span className="slot-bar" data-slot={slot.id}>
                          {weekdays.join("・")}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="matrix-comment">{entry.comment}</td>
                <td className="matrix-time">{formatLastEditedAt(entry.lastEditedAt)}</td>
                <td>
                  {isMine && (
                    <span className="matrix-actions">
                      <button type="button" onClick={() => onEdit?.(entry)}>編集</button>
                      <button type="button" onClick={() => onDelete?.(entry.name)}>削除</button>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
