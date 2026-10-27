// 같은 항목 동시 편집 판정(스펙 interior-planner "동기화·이전 규칙", ADR-029 조건 8).
import { describe, expect, it } from "vitest";

import { makePlanP } from "@/test/interiorPlanFixture";

import { isInteriorItemEditConflict } from "./interiorItemConflict";

const OPENED = "2026-10-26T00:02:00.000Z"; // fixture P의 타일 항목 updatedAt

const withTileUpdatedAt = (updatedAt: string) => [
  makePlanP({
    items: makePlanP().items.map((item) =>
      item.id === "item-tile" ? { ...item, updatedAt } : item,
    ),
  }),
];

describe("isInteriorItemEditConflict", () => {
  it("열었을 때와 같은 updatedAt이면 충돌 아님", () => {
    expect(isInteriorItemEditConflict([makePlanP()], "plan-p", "item-tile", OPENED)).toBe(false);
  });

  it("1ms라도 다르면 충돌", () => {
    expect(
      isInteriorItemEditConflict(
        withTileUpdatedAt("2026-10-26T00:02:00.001Z"),
        "plan-p",
        "item-tile",
        OPENED,
      ),
    ).toBe(true);
  });

  it("더 옛 값으로 바뀌어도(시계 차이) 다르면 충돌", () => {
    expect(
      isInteriorItemEditConflict(
        withTileUpdatedAt("2026-10-25T23:59:59.999Z"),
        "plan-p",
        "item-tile",
        OPENED,
      ),
    ).toBe(true);
  });

  it("같은 계획의 다른 항목만 바뀌면 충돌 아님", () => {
    const plans = [
      makePlanP({
        items: makePlanP().items.map((item) =>
          item.id === "item-kitchen" ? { ...item, updatedAt: "2026-10-27T00:00:00.000Z" } : item,
        ),
      }),
    ];
    expect(isInteriorItemEditConflict(plans, "plan-p", "item-tile", OPENED)).toBe(false);
  });

  it("항목이 지워졌으면 충돌로 보지 않는다(쓰기가 notFound로 알림)", () => {
    const plans = [
      makePlanP({ items: makePlanP().items.filter((item) => item.id !== "item-tile") }),
    ];
    expect(isInteriorItemEditConflict(plans, "plan-p", "item-tile", OPENED)).toBe(false);
  });

  it("계획이 없거나 목록이 비면 충돌 아님", () => {
    expect(isInteriorItemEditConflict([makePlanP()], "other-plan", "item-tile", OPENED)).toBe(
      false,
    );
    expect(isInteriorItemEditConflict([], "plan-p", "item-tile", OPENED)).toBe(false);
  });

  it("다른 계획에 같은 itemId가 있어도 지정한 계획의 항목만 본다", () => {
    const plans = [
      makePlanP({
        id: "plan-x",
        items: [{ ...makePlanP().items[1], updatedAt: "2099-01-01T00:00:00.000Z" }],
      }),
      makePlanP(),
    ];
    expect(isInteriorItemEditConflict(plans, "plan-p", "item-tile", OPENED)).toBe(false);
    expect(isInteriorItemEditConflict(plans, "plan-x", "item-tile", OPENED)).toBe(true);
  });
});
