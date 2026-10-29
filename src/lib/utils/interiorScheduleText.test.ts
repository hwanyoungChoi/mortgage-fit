import { describe, expect, it } from "vitest";

import { interiorScheduleTextOf } from "./interiorScheduleText";

describe("interiorScheduleTextOf", () => {
  it.each([
    [{}, null],
    [{ startDate: "2026-11-03" }, "11/3"],
    [{ startDate: "2026-11-03", endDate: "2026-11-03" }, "11/3"],
    [{ startDate: "2026-11-28", endDate: "2026-12-02" }, "11/28~12/2"],
    [{ endDate: "2026-11-07" }, "~11/7"],
  ])("%o → %s", (dates, text) => {
    expect(interiorScheduleTextOf(dates)).toBe(text);
  });
});
