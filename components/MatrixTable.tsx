"use client";

/**
 * マトリクス表コンポーネント（要件 1.1-1.5, 3.2, 3.3, 4.3, 6.3 / design.md「MatrixTable」）
 *
 * - 縦=参加者名・横=固定4時間帯（TIME_SLOTS）の表を描画する
 * - ブラウザに記憶された名前（lib/identity）と一致する行にのみ編集・削除ボタンを表示する
 * - 編集・削除の実処理は持たず、コールバック（onEdit / onDelete）の呼び出しまでを担う
 */

import { useEffect, useState } from "react";
import { getMyName } from "@/lib/identity";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { MemberEntry } from "@/lib/types";

interface MatrixTableProps {
  entries: MemberEntry[];
  /** 本人行の「編集」押下時に呼ばれる（配線は後続タスク） */
  onEdit?: (entry: MemberEntry) => void;
  /** 本人行の「削除」押下時に呼ばれる（確認・API 呼び出しは後続タスク） */
  onDelete?: (name: string) => void;
}

/** ISO 8601 文字列を「7/21 15:00」のような表示用文字列にする。解釈不能なら空文字 */
function formatLastEditedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${minutes}`;
}

export default function MatrixTable({ entries, onEdit, onDelete }: MatrixTableProps) {
  // SSR 時は localStorage を参照できないため null で描画し（ボタン非表示）、
  // マウント後に判定することで hydration mismatch を避ける
  const [myName, setMyName] = useState<string | null>(null);
  useEffect(() => {
    setMyName(getMyName());
  }, []);

  if (entries.length === 0) {
    return (
      <p className="matrix-empty">
        まだ誰も入力していません。入力フォームから名前と希望曜日を登録すると、ここに表が表示されます。
      </p>
    );
  }

  return (
    <div className="matrix-wrap">
      <table className="matrix-table">
        <thead>
          <tr>
            <th scope="col" className="matrix-name-col">
              名前
            </th>
            {TIME_SLOTS.map((slot) => (
              <th scope="col" key={slot.id}>
                {slot.label}
              </th>
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
                <th scope="row" className="matrix-name-col">
                  {entry.name}
                </th>
                {TIME_SLOTS.map((slot) => (
                  <td key={slot.id}>{entry.preferences[slot.id].join("・")}</td>
                ))}
                <td className="matrix-comment">{entry.comment}</td>
                <td>{formatLastEditedAt(entry.lastEditedAt)}</td>
                <td>
                  {isMine && (
                    <span className="matrix-actions">
                      <button type="button" onClick={() => onEdit?.(entry)}>
                        編集
                      </button>
                      <button type="button" onClick={() => onDelete?.(entry.name)}>
                        削除
                      </button>
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
