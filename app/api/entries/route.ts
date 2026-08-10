// 人単位の保存・削除 API（design.md「api/entries」API Contract 準拠）
// 要件 2.1（trimして保存）, 2.4（空配列=削除はdb層/entryRulesが判断）, 2.5（空名前は400）,
// 4.1/4.2（コメント保存・上書き）, 5.1（人単位削除）を実装する

import { NextRequest, NextResponse } from "next/server";
import { deleteEntry, upsertEntry } from "@/lib/db";
import { validateName } from "@/lib/entryRules";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { SlotId, Weekday } from "@/lib/types";

/** DB障害時にユーザーへ表示する再試行案内（design.md Error Handling 準拠） */
const RETRY_MESSAGE = "保存に失敗しました。時間をおいて再試行してください";

const SLOT_ID_SET: ReadonlySet<string> = new Set(
  TIME_SLOTS.map((slot) => slot.id),
);
function isSlotId(value: string): value is SlotId {
  return SLOT_ID_SET.has(value);
}

/** 時間帯ごとに選べる曜日が違う（例: 10-12 は土日のみ） */
const ALLOWED_WEEKDAYS_BY_SLOT: ReadonlyMap<SlotId, ReadonlySet<string>> =
  new Map(TIME_SLOTS.map((slot) => [slot.id, new Set<string>(slot.weekdays)]));

/**
 * preferences が「全 SlotId をちょうど1回キーに持ち、値がその時間帯で選べる Weekday の配列」
 * であることを検証する。未知の slot_id・その時間帯で選べない曜日・欠落した slot_id は
 * すべて invalid 扱い（要件 2.4 の前提整合性）。
 */
function validatePreferences(
  raw: unknown,
): { ok: true; preferences: Record<SlotId, Weekday[]> } | { ok: false } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false };
  }
  const record = raw as Record<string, unknown>;

  // 未知のキーが含まれていないか
  for (const key of Object.keys(record)) {
    if (!isSlotId(key)) {
      return { ok: false };
    }
  }

  const preferences = {} as Record<SlotId, Weekday[]>;
  for (const { id } of TIME_SLOTS) {
    const value = record[id];
    const allowed = ALLOWED_WEEKDAYS_BY_SLOT.get(id);
    if (
      !Array.isArray(value) ||
      !value.every(
        (weekday): weekday is Weekday =>
          typeof weekday === "string" && allowed?.has(weekday) === true,
      )
    ) {
      return { ok: false };
    }
    preferences[id] = value;
  }

  return { ok: true, preferences };
}

interface PostRequestBody {
  name?: unknown;
  comment?: unknown;
  preferences?: unknown;
}

interface DeleteRequestBody {
  name?: unknown;
}

async function parseJsonBody(request: NextRequest): Promise<unknown> {
  return request.json();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: PostRequestBody;
  try {
    body = (await parseJsonBody(request)) as PostRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_BODY" },
      { status: 400 },
    );
  }

  const nameResult = validateName(
    typeof body.name === "string" ? body.name : "",
  );
  if (!nameResult.ok) {
    return NextResponse.json(
      { ok: false, error: nameResult.error },
      { status: 400 },
    );
  }

  const preferencesResult = validatePreferences(body.preferences);
  if (!preferencesResult.ok) {
    return NextResponse.json(
      { ok: false, error: "INVALID_PREFERENCES" },
      { status: 400 },
    );
  }

  const comment = typeof body.comment === "string" ? body.comment : "";

  try {
    await upsertEntry({
      name: nameResult.name,
      comment,
      preferences: preferencesResult.preferences,
    });
  } catch (error) {
    console.error("upsertEntry failed", error);
    return NextResponse.json(
      { ok: false, error: RETRY_MESSAGE },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  let body: DeleteRequestBody;
  try {
    body = (await parseJsonBody(request)) as DeleteRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_BODY" },
      { status: 400 },
    );
  }

  const nameResult = validateName(
    typeof body.name === "string" ? body.name : "",
  );
  if (!nameResult.ok) {
    return NextResponse.json(
      { ok: false, error: nameResult.error },
      { status: 400 },
    );
  }

  try {
    await deleteEntry(nameResult.name);
  } catch (error) {
    console.error("deleteEntry failed", error);
    return NextResponse.json(
      { ok: false, error: RETRY_MESSAGE },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
