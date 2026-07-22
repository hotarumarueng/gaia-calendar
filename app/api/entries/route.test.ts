// api/entries の Route Handler テスト（design.md「api/entries」API Contract 準拠）
// 要件 2.1（trimして保存）, 2.4（空配列は削除）, 2.5（空名前は400）, 4.1/4.2（コメント）を検証する
// db.ts は vi.mock でモックし、実テーブルに依存せず「検証部分の振る舞い」を正確に検証する

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { SlotId, Weekday } from "@/lib/types";

const upsertEntry = vi.fn();
const deleteEntry = vi.fn();

vi.mock("@/lib/db", () => ({
  upsertEntry: (...args: unknown[]) => upsertEntry(...args),
  deleteEntry: (...args: unknown[]) => deleteEntry(...args),
}));

// vi.mock はホイストされるため、モック定義後に route を import する
const { POST, DELETE } = await import("./route");

const ALL_SLOT_IDS: SlotId[] = TIME_SLOTS.map((slot) => slot.id);

/** テスト用の preferences を組み立てるヘルパー（未指定の枠は空配列で補完） */
function buildPreferences(
  overrides: Partial<Record<SlotId, Weekday[]>> = {},
): Record<SlotId, Weekday[]> {
  const base = {} as Record<SlotId, Weekday[]>;
  for (const slotId of ALL_SLOT_IDS) {
    base[slotId] = [];
  }
  return { ...base, ...overrides };
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/entries", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  upsertEntry.mockReset();
  deleteEntry.mockReset();
});

describe("POST /api/entries（2.1, 2.4, 2.5, 4.1, 4.2）", () => {
  it("正常な入力は名前をtrimしてupsertEntryを呼び、200 ok:trueを返す", async () => {
    upsertEntry.mockResolvedValue(undefined);

    const response = await POST(
      postRequest({
        name: "  とりうみ  ",
        comment: "テスト中",
        preferences: buildPreferences({ "19-21": ["火"] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(upsertEntry).toHaveBeenCalledWith({
      name: "とりうみ",
      comment: "テスト中",
      preferences: buildPreferences({ "19-21": ["火"] }),
    });
  });

  it("空配列の時間帯を含めてそのままupsertEntryに渡す（db層が削除を判断する）", async () => {
    upsertEntry.mockResolvedValue(undefined);

    await POST(
      postRequest({
        name: "とりうみ",
        comment: "",
        preferences: buildPreferences(),
      }),
    );

    expect(upsertEntry).toHaveBeenCalledWith({
      name: "とりうみ",
      comment: "",
      preferences: buildPreferences(),
    });
  });

  it("trim後に空文字になる名前は400 EMPTY_NAMEを返し、upsertEntryを呼ばない", async () => {
    const response = await POST(
      postRequest({
        name: "   ",
        comment: "",
        preferences: buildPreferences(),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "EMPTY_NAME" });
    expect(upsertEntry).not.toHaveBeenCalled();
  });

  it("未知のslot_idを含むpreferencesは400を返し、upsertEntryを呼ばない", async () => {
    const response = await POST(
      postRequest({
        name: "とりうみ",
        comment: "",
        preferences: { ...buildPreferences(), "99-100": ["月"] },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "INVALID_PREFERENCES",
    });
    expect(upsertEntry).not.toHaveBeenCalled();
  });

  it("未知の曜日を含むpreferencesは400を返し、upsertEntryを呼ばない", async () => {
    const response = await POST(
      postRequest({
        name: "とりうみ",
        comment: "",
        preferences: buildPreferences({
          "19-21": ["月曜日" as unknown as Weekday],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "INVALID_PREFERENCES",
    });
    expect(upsertEntry).not.toHaveBeenCalled();
  });

  it("preferencesに全時間帯が揃っていない場合は400を返す", async () => {
    const incomplete = buildPreferences();
    delete (incomplete as Partial<Record<SlotId, Weekday[]>>)["10-12"];

    const response = await POST(
      postRequest({ name: "とりうみ", comment: "", preferences: incomplete }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "INVALID_PREFERENCES",
    });
  });

  it("db層が例外を投げた場合は500と再試行案内を返す", async () => {
    upsertEntry.mockRejectedValue(new Error("DynamoDB接続失敗"));

    const response = await POST(
      postRequest({
        name: "とりうみ",
        comment: "",
        preferences: buildPreferences(),
      }),
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("再試行");
  });
});

describe("DELETE /api/entries（5.1）", () => {
  it("正常な名前でdeleteEntryを呼び、200 ok:trueを返す", async () => {
    deleteEntry.mockResolvedValue(undefined);

    const response = await DELETE(deleteRequest({ name: "  とりうみ  " }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(deleteEntry).toHaveBeenCalledWith("とりうみ");
  });

  it("空名前は400 EMPTY_NAMEを返し、deleteEntryを呼ばない", async () => {
    const response = await DELETE(deleteRequest({ name: "   " }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "EMPTY_NAME" });
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it("db層が例外を投げた場合は500と再試行案内を返す", async () => {
    deleteEntry.mockRejectedValue(new Error("DynamoDB接続失敗"));

    const response = await DELETE(deleteRequest({ name: "とりうみ" }));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("再試行");
  });
});
