// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DeleteConfirm from "@/components/DeleteConfirm";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

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

afterEach(() => {
  cleanup();
  // refreshMock は vi.mock ファクトリで生成されファイル全体で共有されるため、
  // 呼び出し履歴を都度クリアしないとテスト間で回数が積み上がってしまう
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DeleteConfirm: 確認キャンセル時（5.2）", () => {
  it("confirm でキャンセルすると DELETE を呼ばない", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));

    render(<DeleteConfirm name="とりうみ" />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("DeleteConfirm: 確認して削除実行（5.1, 5.2）", () => {
  it("confirm を先に呼んでから DELETE /api/entries を正しい引数で呼ぶ", async () => {
    const confirmMock = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmMock);
    const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DeleteConfirm name="とりうみ" />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    await screen.findByRole("button", { name: "削除" });

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/entries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "とりうみ" }),
    });
  });

  it("200 応答なら表を最新化する（refresh を呼ぶ）", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeJsonResponse(200, { ok: true })),
    );

    render(<DeleteConfirm name="とりうみ" />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    await screen.findByRole("button", { name: "削除" });

    expect(refreshMock).toHaveBeenCalledOnce();
  });
});

describe("DeleteConfirm: 削除失敗時", () => {
  it("500 応答なら再試行を促すメッセージを表示する", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeJsonResponse(500, { ok: false })),
    );

    render(<DeleteConfirm name="とりうみ" />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "削除に失敗しました。時間をおいて再試行してください",
    );
  });

  it("fetch が例外を投げても再試行を促すメッセージを表示する", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<DeleteConfirm name="とりうみ" />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "削除に失敗しました。時間をおいて再試行してください",
    );
  });
});
