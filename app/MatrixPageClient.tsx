"use client";

/**
 * マトリクスページのクライアント側ラッパー（タスク 4.1）
 *
 * Server Component（page.tsx）が取得した表データを受け取り、
 * MatrixTable・EntryForm を1ページに配置して編集・削除の状態を管理する。
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import EntryForm from "@/components/EntryForm";
import MatrixTable from "@/components/MatrixTable";
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
    <>
      <MatrixTable
        entries={entries}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
      {deleteError && <p role="alert">{deleteError}</p>}
      <EntryForm
        key={editingEntry?.name ?? "__new__"}
        initialEntry={editingEntry}
      />
      {editingEntry && (
        <button type="button" onClick={handleCancelEdit}>
          編集をキャンセル
        </button>
      )}
    </>
  );
}
