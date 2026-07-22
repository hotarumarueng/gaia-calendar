"use client";

/**
 * 削除確認（要件 5.1, 5.2 / design.md「DeleteConfirm」）
 *
 * - 削除ボタン押下時に window.confirm で確認を挟んでから DELETE /api/entries を呼ぶ
 * - キャンセル時は API を呼ばない
 * - 200 応答なら router.refresh() で表を最新化する。失敗時は再試行を促すメッセージを表示する
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

interface DeleteConfirmProps {
  /** 削除対象の参加者名 */
  name: string;
}

/** ネットワーク断・500 応答時に表示する再試行案内 */
const RETRY_MESSAGE = "削除に失敗しました。時間をおいて再試行してください";

export default function DeleteConfirm({ name }: DeleteConfirmProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (deleting) return;

    const confirmed = window.confirm(
      `${name} さんのデータを削除します。よろしいですか？`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

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

      setError(RETRY_MESSAGE);
    } catch {
      setError(RETRY_MESSAGE);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={handleClick} disabled={deleting}>
        削除
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
