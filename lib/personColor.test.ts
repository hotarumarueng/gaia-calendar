import { describe, expect, it } from "vitest";
import { PERSON_COLORS, buildPersonColors } from "@/lib/personColor";

describe("buildPersonColors", () => {
  it("5人までは全員違う色になる", () => {
    const colors = buildPersonColors(["A", "B", "C", "D", "E"]);
    expect(new Set(colors.values()).size).toBe(5);
  });

  it("渡す順番が違っても同じ人には同じ色を返す（Scan 順に依存しない）", () => {
    const a = buildPersonColors(["きたうら", "るま", "オーギー"]);
    const b = buildPersonColors(["オーギー", "きたうら", "るま"]);
    for (const name of ["きたうら", "るま", "オーギー"]) {
      expect(a.get(name)).toBe(b.get(name));
    }
  });

  it("6人目以降はパレットを先頭から使い回す", () => {
    const names = ["1", "2", "3", "4", "5", "6"];
    const colors = buildPersonColors(names);
    expect(colors.get("6")).toBe(colors.get("1"));
    expect(colors.get("6")).toBe(PERSON_COLORS[0]);
  });

  it("空配列でも落ちない", () => {
    expect(buildPersonColors([]).size).toBe(0);
  });
});
