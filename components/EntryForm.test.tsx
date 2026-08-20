// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import EntryForm from "@/components/EntryForm";
import type { MemberEntry } from "@/lib/types";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/identity", () => ({
  saveMyName: vi.fn(),
  getMyName: vi.fn(() => null),
}));

// vi.mock はホイストされるため、モック後に import して spy として参照する
import { getMyName, saveMyName } from "@/lib/identity";

/** { ok: boolean, ... } を返す Response 相当の最小モックを作る */
function makeJsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

/** テストから任意のタイミングで解決できる fetch モックを作る */
function createDeferredFetch(): {
  fetchMock: ReturnType<typeof vi.fn>;
  resolve: (res: Response) => void;
} {
  let resolveFn: (res: Response) => void = () => {};
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolveFn = resolve;
      }),
  );
  return {
    fetchMock,
    resolve: (res: Response) => resolveFn(res),
  };
}

function makeEntry(overrides: Partial<MemberEntry> = {}): MemberEntry {
  return {
    name: "とりうみ",
    comment: "",
    preferences: { "21-23": [], "10-12": [] },
    lastEditedAt: "2026-07-21T15:00:00",
    answeredThisWeek: true,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  // refreshMock / saveMyName は vi.mock ファクトリで生成されファイル全体で共有されるため、
  // 呼び出し履歴を都度クリアしないとテスト間で回数が積み上がってしまう
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("EntryForm: 通常保存（2.1, 3.1）", () => {
  it("保存すると POST /api/entries を正しい引数で呼ぶ", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<EntryForm />);

    fireEvent.change(screen.getByLabelText("名前"), {
      target: { value: "とりうみ" },
    });
    fireEvent.change(screen.getByLabelText("ひとことコメント（任意）"), {
      target: { value: "今週は忙しめ" },
    });
    const slotGroup = screen.getByRole("group", { name: "21:00-23:00" });
    fireEvent.click(within(slotGroup).getByRole("checkbox", { name: "火" }));

    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));

    await screen.findByRole("button", { name: "回答を送信する" });

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "とりうみ",
        comment: "今週は忙しめ",
        preferences: {
          "21-23": ["火"],
          "10-12": [],
        },
      }),
    });
  });

  it("200 応答なら名前を記憶し、表を最新化する（refresh を呼ぶ）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeJsonResponse(200, { ok: true })),
    );

    render(<EntryForm />);
    fireEvent.change(screen.getByLabelText("名前"), {
      target: { value: "とりうみ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));

    await screen.findByRole("button", { name: "回答を送信する" });

    expect(saveMyName).toHaveBeenCalledExactlyOnceWith("とりうみ");
    expect(refreshMock).toHaveBeenCalledOnce();
  });

  it("初期値（initialEntry）でフォームが編集用に事前入力される", () => {
    const entry = makeEntry({
      name: "ほたる",
      comment: "既存コメント",
      preferences: { "21-23": ["月"], "10-12": [] },
    });
    render(<EntryForm initialEntry={entry} />);

    expect((screen.getByLabelText("名前") as HTMLInputElement).value).toBe(
      "ほたる",
    );
    expect(
      (screen.getByLabelText("ひとことコメント（任意）") as HTMLTextAreaElement)
        .value,
    ).toBe("既存コメント");
    const slotGroup = screen.getByRole("group", { name: "21:00-23:00" });
    expect(
      (within(slotGroup).getByRole("checkbox", { name: "月" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
});

describe("EntryForm: 400 応答のインラインエラー（2.5）", () => {
  it("名前が空で保存すると EMPTY_NAME エラーをインライン表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeJsonResponse(400, { ok: false, error: "EMPTY_NAME" }),
      ),
    );

    render(<EntryForm />);
    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("名前を入力してください");
  });

  it("400 応答時は保存を行わず、名前を記憶しない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeJsonResponse(400, { ok: false, error: "EMPTY_NAME" }),
      ),
    );

    render(<EntryForm />);
    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));

    await screen.findByRole("alert");

    expect(saveMyName).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("EntryForm: ネットワーク/サーバーエラー", () => {
  it("500 応答なら再試行を促すメッセージを表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeJsonResponse(500, { ok: false })),
    );

    render(<EntryForm />);
    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "保存に失敗しました。時間をおいて再試行してください",
    );
  });

  it("fetch が例外を投げても再試行を促すメッセージを表示する", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<EntryForm />);
    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "保存に失敗しました。時間をおいて再試行してください",
    );
  });
});

describe("EntryForm: 名前の自動入力（週次リセット後に曜日だけ入れ直せるように）", () => {
  it("ブラウザに名前が記憶されていれば名前欄に入っている", async () => {
    vi.mocked(getMyName).mockReturnValue("ほたる");

    render(<EntryForm />);

    const input = await screen.findByLabelText<HTMLInputElement>("名前");
    expect(input.value).toBe("ほたる");
  });

  it("記憶された名前がなければ空のまま", () => {
    vi.mocked(getMyName).mockReturnValue(null);

    render(<EntryForm />);

    expect(screen.getByLabelText<HTMLInputElement>("名前").value).toBe("");
  });

  it("編集モードでは記憶された名前より編集対象の名前が優先される", () => {
    vi.mocked(getMyName).mockReturnValue("ほたる");

    render(<EntryForm initialEntry={makeEntry({ name: "とりうみ" })} />);

    expect(screen.getByLabelText<HTMLInputElement>("名前").value).toBe("とりうみ");
  });

  it("自動入力された名前を書き換えて送信すると、書き換え後の名前が送られる", async () => {
    vi.mocked(getMyName).mockReturnValue("ほたる");
    const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<EntryForm />);
    const input = await screen.findByLabelText<HTMLInputElement>("名前");
    fireEvent.change(input, { target: { value: "とりうみ" } });
    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.name).toBe("とりうみ");
  });

  it("サーバー描画の時点では名前欄は空（hydration mismatch の再発防止）", () => {
    // localStorage はサーバーに無い。初回描画で読んでしまうと 2c01453 と同じ不整合が起きる
    vi.mocked(getMyName).mockReturnValue("ほたる");

    const html = renderToString(<EntryForm />);

    expect(html).not.toContain("ほたる");
  });
});

describe("EntryForm: 二重送信の防止", () => {
  it("送信中は保存ボタンが disabled になり、fetch は1回しか呼ばれない", async () => {
    const { fetchMock, resolve } = createDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);

    render(<EntryForm />);
    fireEvent.change(screen.getByLabelText("名前"), {
      target: { value: "とりうみ" },
    });

    const submitButton = screen.getByRole("button", { name: "回答を送信する" });
    fireEvent.click(submitButton);

    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button"));

    expect(fetchMock).toHaveBeenCalledOnce();

    resolve(makeJsonResponse(200, { ok: true }));
    await screen.findByRole("button", { name: "回答を送信する" });
  });
});
