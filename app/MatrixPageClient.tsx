"use client";

/**
 * ページのクライアント側ラッパー
 *
 * Server Component（page.tsx）が取得した表データを受け取り、
 * 左＝自分の回答パネル（EntryForm＋RosterList）、右＝集計（ScheduleSummary）
 * の2カラムに配置して編集・削除の状態を管理する。
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import AvailabilityGrid from "@/components/AvailabilityGrid";
import EntryForm from "@/components/EntryForm";
import RosterList from "@/components/RosterList";
import ScheduleSummary from "@/components/ScheduleSummary";
import type { MemberEntry } from "@/lib/types";

interface MatrixPageClientProps {
  entries: MemberEntry[];
}

/** 削除 API 失敗時の再試行案内（design.md Error Handling 準拠） */
const DELETE_RETRY_MESSAGE =
  "削除に失敗しました。時間をおいて再試行してください";

export default function MatrixPageClient({ entries }: MatrixPageClientProps) {
  const router = useRouter();
  const [editingEntry, setEditingEntry] = useState<MemberEntry | undefined>();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleEdit(entry: MemberEntry) {
    setEditingEntry(entry);
  }

  function handleCancelEdit() {
    setEditingEntry(undefined);
  }

  async function handleDelete(name: string) {
    const confirmed = window.confirm(
      `${name} さんのデータを削除します。よろしいですか？`,
    );
    if (!confirmed) return;

    setDeleteError(null);

    try {
      const res = await fetch("/api/entries", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (res.ok) {
        router.refresh();
        return;
      }

      setDeleteError(DELETE_RETRY_MESSAGE);
    } catch {
      setDeleteError(DELETE_RETRY_MESSAGE);
    }
  }

  return (
    // 1024px 未満では CSS 側で1カラムに戻り、集計が先頭に来る
    <div className="board">
      <section className="board-input panel">
        <div className="panel-head">
          <h2 className="panel-title">
            {editingEntry ? `${editingEntry.name} の回答を修正` : "いつ集まりまっか〜"}
          </h2>
          <p className="panel-sub">空いてる曜日をえらんで送信してね</p>
        </div>

        <EntryForm
          key={editingEntry?.name ?? "__new__"}
          initialEntry={editingEntry}
        />
        {editingEntry && (
          <button type="button" className="btn btn-ghost btn-block" onClick={handleCancelEdit}>
            編集をキャンセル
          </button>
        )}

        <hr className="panel-divider" />

        <div className="roster-head">
          <span className="roster-head-title">みんなの回答状況</span>
          <span className="roster-head-meta">最終編集</span>
        </div>
        {deleteError && <p role="alert" className="delete-error">{deleteError}</p>}
        <RosterList
          entries={entries}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </section>

      <div className="board-main">
        <ScheduleSummary entries={entries} />
        <AvailabilityGrid entries={entries} />
      </div>
    </div>
  );
}
