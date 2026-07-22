"use client";

/**
 * 入力フォーム（要件 2.1, 2.5, 3.1, 4.1 / design.md「EntryForm」）
 *
 * - 名前・コメント・4時間帯×曜日チェックを入力し、保存で POST /api/entries を呼ぶ
 * - 200 応答: 名前を localStorage に記憶（identity.saveMyName）し、router.refresh() で表を最新化する
 * - 400 応答: レスポンスの error をフォーム内にインライン表示する（保存は行わない）
 * - ネットワーク/500 エラー: 再試行を促すメッセージを表示する
 * - `initialEntry` を渡すと、新規入力と同じフォームで編集入力として扱える
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { saveMyName } from "@/lib/identity";
import { TIME_SLOTS, WEEKDAYS } from "@/lib/timeSlots";
import type { MemberEntry, SlotId, Weekday } from "@/lib/types";

interface EntryFormProps {
  /** 編集対象の既存エントリ。省略時は新規入力として空欄から始まる */
  initialEntry?: MemberEntry;
}

/** ネットワーク断・500 応答時に表示する再試行案内（design.md Error Handling 準拠の文言） */
const RETRY_MESSAGE = "保存に失敗しました。時間をおいて再試行してください";

/** API の 400 応答（error コード）をフォーム向けの日本語メッセージに変換する */
function errorMessageFor(error: string | undefined): string {
  switch (error) {
    case "EMPTY_NAME":
      return "名前を入力してください";
    case "INVALID_PREFERENCES":
      return "希望曜日の指定を確認してください";
    case "INVALID_BODY":
      return "入力内容を確認してください";
    default:
      return RETRY_MESSAGE;
  }
}

/** レスポンス JSON から error コード（文字列）を安全に取り出す。取得できなければ undefined */
async function readErrorCode(res: Response): Promise<string | undefined> {
  try {
    const data: unknown = await res.json();
    if (typeof data === "object" && data !== null && "error" in data) {
      const error = (data as { error?: unknown }).error;
      return typeof error === "string" ? error : undefined;
    }
  } catch {
    // JSON として解釈できない応答は undefined 扱い（デフォルトの再試行メッセージにフォールバック）
  }
  return undefined;
}

function buildInitialPreferences(
  initialEntry: MemberEntry | undefined,
): Record<SlotId, Weekday[]> {
  const preferences = {} as Record<SlotId, Weekday[]>;
  for (const slot of TIME_SLOTS) {
    preferences[slot.id] = initialEntry?.preferences[slot.id] ?? [];
  }
  return preferences;
}

export default function EntryForm({ initialEntry }: EntryFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialEntry?.name ?? "");
  const [comment, setComment] = useState(initialEntry?.comment ?? "");
  const [preferences, setPreferences] = useState<Record<SlotId, Weekday[]>>(
    () => buildInitialPreferences(initialEntry),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleWeekday(slotId: SlotId, weekday: Weekday) {
    setPreferences((prev) => {
      const current = prev[slotId];
      const next = current.includes(weekday)
        ? current.filter((day) => day !== weekday)
        : [...current, weekday];
      return { ...prev, [slotId]: next };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, comment, preferences }),
      });

      if (res.ok) {
        saveMyName(name);
        router.refresh();
        return;
      }

      if (res.status === 400) {
        const errorCode = await readErrorCode(res);
        setError(errorMessageFor(errorCode));
        return;
      }

      setError(RETRY_MESSAGE);
    } catch {
      setError(RETRY_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form aria-label="希望入力フォーム" onSubmit={handleSubmit}>
      <label>
        名前
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        コメント
        <input
          type="text"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      {TIME_SLOTS.map((slot) => (
        <fieldset key={slot.id}>
          <legend>{slot.label}</legend>
          {WEEKDAYS.map((weekday) => (
            <label key={weekday}>
              <input
                type="checkbox"
                checked={preferences[slot.id].includes(weekday)}
                onChange={() => toggleWeekday(slot.id, weekday)}
              />
              {weekday}
            </label>
          ))}
        </fieldset>
      ))}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "保存中..." : "保存"}
      </button>
    </form>
  );
}
