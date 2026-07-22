"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { saveMyName } from "@/lib/identity";
import { TIME_SLOTS, WEEKDAYS } from "@/lib/timeSlots";
import type { MemberEntry, SlotId, Weekday } from "@/lib/types";

interface EntryFormProps {
  initialEntry?: MemberEntry;
}

const RETRY_MESSAGE = "保存に失敗しました。時間をおいて再試行してください";

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

async function readErrorCode(res: Response): Promise<string | undefined> {
  try {
    const data: unknown = await res.json();
    if (typeof data === "object" && data !== null && "error" in data) {
      const error = (data as { error?: unknown }).error;
      return typeof error === "string" ? error : undefined;
    }
  } catch {
    // fallback
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
    <form aria-label="希望入力フォーム" className="entry-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="entry-name">名前</label>
          <input
            id="entry-name"
            className="form-input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="entry-comment">コメント</label>
          <input
            id="entry-comment"
            className="form-input"
            type="text"
            placeholder="例: 今週は火木が空いてます"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>
      </div>
      {TIME_SLOTS.map((slot) => (
        <fieldset key={slot.id} className="slot-fieldset">
          <legend className="slot-legend" data-slot={slot.id}>{slot.label}</legend>
          <div className="weekday-group">
            {WEEKDAYS.map((weekday) => (
              <label key={weekday} className="weekday-chip" data-slot={slot.id}>
                <input
                  type="checkbox"
                  checked={preferences[slot.id].includes(weekday)}
                  onChange={() => toggleWeekday(slot.id, weekday)}
                />
                {weekday}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {error && <p role="alert" className="form-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? "保存中..." : "保存"}
      </button>
    </form>
  );
}
