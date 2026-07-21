import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMyName, getMyName, saveMyName } from "@/lib/identity";

/** design.md（identity / State Management）で定められた localStorage キー */
const STORAGE_KEY = "gaia-calendar:name";

/** node 環境でも使える最小の localStorage 実装（Map ベース） */
function createFakeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

/** ブラウザ相当の window（localStorage 付き）をグローバルに差し込む */
function stubBrowserWindow(localStorage: Storage): void {
  vi.stubGlobal("window", { localStorage });
}

/** localStorage の全操作が例外を投げる環境（プライベートモード等）を再現する */
function createThrowingLocalStorage(): Storage {
  const throwError = () => {
    throw new Error("localStorage is disabled");
  };
  return {
    get length(): number {
      return throwError();
    },
    key: throwError,
    getItem: throwError,
    setItem: throwError,
    removeItem: throwError,
    clear: throwError,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("identity: ブラウザ環境での保存・取得・削除（3.1）", () => {
  it("saveMyName はキー gaia-calendar:name に名前を保存する", () => {
    const localStorage = createFakeLocalStorage();
    stubBrowserWindow(localStorage);

    saveMyName("とりうみ");

    expect(localStorage.getItem(STORAGE_KEY)).toBe("とりうみ");
  });

  it("保存した名前を getMyName で取得できる", () => {
    stubBrowserWindow(createFakeLocalStorage());

    saveMyName("とりうみ");

    expect(getMyName()).toBe("とりうみ");
  });

  it("名前は trim して保存する（design.md: trim後の名前を保持）", () => {
    stubBrowserWindow(createFakeLocalStorage());

    saveMyName("  とりうみ  ");

    expect(getMyName()).toBe("とりうみ");
  });

  it("未保存なら getMyName は null を返す", () => {
    stubBrowserWindow(createFakeLocalStorage());

    expect(getMyName()).toBeNull();
  });

  it("clearMyName で保存した名前が消える", () => {
    stubBrowserWindow(createFakeLocalStorage());

    saveMyName("とりうみ");
    clearMyName();

    expect(getMyName()).toBeNull();
  });

  it("再保存すると上書きされる", () => {
    stubBrowserWindow(createFakeLocalStorage());

    saveMyName("とりうみ");
    saveMyName("ほたる");

    expect(getMyName()).toBe("ほたる");
  });
});

describe("identity: ページ再読み込み後の永続性（完了条件）", () => {
  it("モジュール再読み込み（リロード相当）後も同じ localStorage から名前を取得できる", async () => {
    // 同一ブラウザの localStorage はリロードを跨いで残る。
    // それを「同じ fake localStorage を保持したままモジュールを再読み込みする」ことで再現する
    const localStorage = createFakeLocalStorage();
    stubBrowserWindow(localStorage);

    saveMyName("とりうみ");

    vi.resetModules();
    const reloaded = await import("@/lib/identity");

    expect(reloaded.getMyName()).toBe("とりうみ");
  });
});

describe("identity: SSR 安全性（window なし）", () => {
  // node 環境の vitest では window は元々未定義（= サーバーサイド相当）

  it("getMyName は null を返す", () => {
    expect(getMyName()).toBeNull();
  });

  it("saveMyName は例外を投げず no-op になる", () => {
    expect(() => saveMyName("とりうみ")).not.toThrow();
  });

  it("clearMyName は例外を投げず no-op になる", () => {
    expect(() => clearMyName()).not.toThrow();
  });
});

describe("identity: localStorage が例外を投げる環境（プライベートモード等）", () => {
  it("saveMyName はクラッシュせず no-op になる", () => {
    stubBrowserWindow(createThrowingLocalStorage());

    expect(() => saveMyName("とりうみ")).not.toThrow();
  });

  it("getMyName はクラッシュせず null を返す", () => {
    stubBrowserWindow(createThrowingLocalStorage());

    expect(getMyName()).toBeNull();
  });

  it("clearMyName はクラッシュせず no-op になる", () => {
    stubBrowserWindow(createThrowingLocalStorage());

    expect(() => clearMyName()).not.toThrow();
  });
});
