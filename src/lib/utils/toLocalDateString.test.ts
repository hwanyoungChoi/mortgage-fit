import { describe, expect, it } from "vitest";

import { toLocalDateString } from "./toLocalDateString";

describe("toLocalDateString", () => {
  it("기기 로컬 날짜를 YYYY-MM-DD로(한 자리 월·일은 0을 붙인다)", () => {
    expect(toLocalDateString(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(toLocalDateString(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31");
  });
});
