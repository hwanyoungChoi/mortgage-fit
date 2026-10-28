// 스펙 interior-vendor-tbd-line-order 태스크 1-3(ADR-036 조건 4): 줄 순서 읽기 규칙(`buildInteriorPlanRows`, AC-2)과
// 쓰기 값(`lineOrderAfterMove`, AC-3), 로컬 계획 만들기가 `lineOrder`를 버리는지(서버 계획 POST와 같음).
// 예시 P(R1~R5)·P⁺(R1~R7)·L(X·Y·Z) 줄 key는 `r{n}:rq{n}`, `item-x:q1`·`item-x:q2`·`item-y:`·`item-z:q3`다.
import { describe, expect, it } from "vitest";

import { INTERIOR_ITEM_MAX_COUNT, INTERIOR_QUOTE_MAX_COUNT } from "@/lib/constants/interiorPlan";
import {
  legacyY,
  makePlanL,
  makeSimplePlanP,
  makeSimplePlanPPlus,
  simpleTime,
} from "@/test/interiorSimpleFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import { buildInteriorPlanRows } from "./interiorPlanRows";
import { createInteriorPlanStore, INTERIOR_PLANS_STORAGE_KEY } from "./interiorPlanStorage";
import { lineOrderAfterMove } from "./lineOrderAfterMove";
import { parseLineOrder } from "./validateInteriorPlan";

import type { InteriorPlanRowGroup } from "./interiorPlanRows";
import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

type PlanRowsInput = Pick<InteriorPlanWithItems, "items" | "lineOrder">;

/** 묶음마다 [구분, 줄 key들] */
const shape = (groups: InteriorPlanRowGroup[]) =>
  groups.map((group) => [group.trade, group.rows.map(({ key }) => key)]);

const groupsOf = (plan: PlanRowsInput) => buildInteriorPlanRows(plan).groups;
const orderOf = (plan: PlanRowsInput) => shape(groupsOf(plan));

const P_ITEMS = () => makeSimplePlanP().items;
const L_ITEMS = () => makePlanL().items;

/** 도배 줄 하나(견적 1개) */
const wallpaperRow = (index: number, trade = "도배"): InteriorItem => ({
  id: `r${index}`,
  spaceId: "sp-whole",
  trade,
  quotes: [{ id: `rq${index}`, vendor: "업체", amountWon: 1000 }],
  status: "planned",
  createdAt: simpleTime(index),
  updatedAt: simpleTime(index),
});

describe("buildInteriorPlanRows — lineOrder 읽기 (AC-2)", () => {
  it("lineOrder가 없으면 기본 순서(항목 순 → 견적 순)", () => {
    expect(orderOf({ items: P_ITEMS() })).toStrictEqual([
      ["도배", ["r1:rq1", "r2:rq2"]],
      ["욕실", ["r3:rq3", "r4:rq4", "r5:rq5"]],
    ]);
  });

  it("P + [r5, r3, r4, r2, r1] → [욕실: R5, R3, R4] → [도배: R2, R1]", () => {
    expect(
      orderOf({ items: P_ITEMS(), lineOrder: ["r5:rq5", "r3:rq3", "r4:rq4", "r2:rq2", "r1:rq1"] }),
    ).toStrictEqual([
      ["욕실", ["r5:rq5", "r3:rq3", "r4:rq4"]],
      ["도배", ["r2:rq2", "r1:rq1"]],
    ]);
  });

  it("일부만·지워진 key: P + [r2] / [gone:q, r2, r1] → [도배: R2, R1] → [욕실: R3, R4, R5]", () => {
    const expected = [
      ["도배", ["r2:rq2", "r1:rq1"]],
      ["욕실", ["r3:rq3", "r4:rq4", "r5:rq5"]],
    ];
    expect(orderOf({ items: P_ITEMS(), lineOrder: ["r2:rq2"] })).toStrictEqual(expected);
    expect(orderOf({ items: P_ITEMS(), lineOrder: ["gone:q", "r2:rq2", "r1:rq1"] })).toStrictEqual(
      expected,
    );
  });

  it("아무 줄도 맞지 않으면 기본 순서와 같다", () => {
    expect(groupsOf({ items: P_ITEMS(), lineOrder: ["gone:q", "x:"] })).toStrictEqual(
      groupsOf({ items: P_ITEMS() }),
    );
  });

  it("새 줄은 그 묶음 끝, 새 구분은 맨 끝 묶음(U5)", () => {
    const lineOrder = ["r2:rq2", "r1:rq1", "r3:rq3", "r4:rq4", "r5:rq5"];
    expect(
      orderOf({ items: [...P_ITEMS(), wallpaperRow(10), wallpaperRow(11, "조명")], lineOrder }),
    ).toStrictEqual([
      ["도배", ["r2:rq2", "r1:rq1", "r10:rq10"]],
      ["욕실", ["r3:rq3", "r4:rq4", "r5:rq5"]],
      ["조명", ["r11:rq11"]],
    ]);
  });

  it("빈 줄 대체 자리: L + [item-y:, item-z:q3, item-x:q1, item-x:q2] → [도배: Y] → [욕실: Z, X q1, X q2]; Y를 견적 1개로 채워도 같다", () => {
    const lineOrder = ["item-y:", "item-z:q3", "item-x:q1", "item-x:q2"];
    expect(orderOf({ items: L_ITEMS(), lineOrder })).toStrictEqual([
      ["도배", ["item-y:"]],
      ["욕실", ["item-z:q3", "item-x:q1", "item-x:q2"]],
    ]);
    const [x, , z] = L_ITEMS();
    const filledY: InteriorItem = { ...legacyY(), quotes: [{ id: "qn", vendor: "육문수" }] };
    expect(orderOf({ items: [x, filledY, z], lineOrder })).toStrictEqual([
      ["도배", ["item-y:qn"]],
      ["욕실", ["item-z:q3", "item-x:q1", "item-x:q2"]],
    ]);
  });

  it("자기 key와 item.id:가 둘 다 있으면 자기 key가 이긴다", () => {
    const [x, , z] = L_ITEMS();
    const filledY: InteriorItem = { ...legacyY(), quotes: [{ id: "qn", vendor: "육문수" }] };
    expect(
      orderOf({ items: [x, filledY, z], lineOrder: ["item-y:", "item-x:q1", "item-y:qn"] }),
    ).toStrictEqual([
      ["욕실", ["item-x:q1", "item-x:q2", "item-z:q3"]],
      ["도배", ["item-y:qn"]],
    ]);
  });

  it("묶음 순서는 그 묶음 줄의 가장 이른 자리, 구분 앞뒤 공백은 같은 묶음", () => {
    const items = P_ITEMS();
    items[1] = { ...items[1], trade: "도배 " };
    expect(
      orderOf({ items, lineOrder: ["r3:rq3", "r1:rq1", "r4:rq4", "r2:rq2", "r5:rq5"] }),
    ).toStrictEqual([
      ["욕실", ["r3:rq3", "r4:rq4", "r5:rq5"]],
      ["도배", ["r1:rq1", "r2:rq2"]],
    ]);
  });
});

describe("lineOrderAfterMove — 쓰기 값 (AC-3)", () => {
  const P_ORDER = ["r1:rq1", "r2:rq2", "r3:rq3", "r4:rq4", "r5:rq5"];

  it("P에서 R2를 R1 위로 → [r2, r1, r3, r4, r5]", () => {
    const groups = groupsOf({ items: P_ITEMS() });
    expect(lineOrderAfterMove(groups, groups, "도배", "r2:rq2", "r1:rq1")).toStrictEqual([
      "r2:rq2",
      "r1:rq1",
      "r3:rq3",
      "r4:rq4",
      "r5:rq5",
    ]);
  });

  it("P⁺에서 R7을 R1 위로 → 묶음 안만 옮기고 다른 묶음은 그대로(전역 arrayMove가 아니다)", () => {
    const groups = groupsOf({ items: makeSimplePlanPPlus().items });
    expect(lineOrderAfterMove(groups, groups, "도배", "r7:rq7", "r1:rq1")).toStrictEqual([
      "r7:rq7",
      "r1:rq1",
      "r2:rq2",
      "r3:rq3",
      "r4:rq4",
      "r5:rq5",
      "r6:rq6",
    ]);
  });

  it("보이는 묶음 순서가 [욕실] → [도배]인 상태에서 R2를 R1 위로 → 묶음 순서 유지", () => {
    const groups = groupsOf({
      items: P_ITEMS(),
      lineOrder: ["r3:rq3", "r1:rq1", "r4:rq4", "r2:rq2", "r5:rq5"],
    });
    expect(lineOrderAfterMove(groups, groups, "도배", "r2:rq2", "r1:rq1")).toStrictEqual([
      "r3:rq3",
      "r4:rq4",
      "r5:rq5",
      "r2:rq2",
      "r1:rq1",
    ]);
  });

  it("연속 두 번: R2를 R1 위로, 이어서 R5를 R3 위로 → 첫 이동이 남아 있다", () => {
    const first = groupsOf({ items: P_ITEMS() });
    const lineOrder = lineOrderAfterMove(first, first, "도배", "r2:rq2", "r1:rq1") ?? [];
    const second = groupsOf({ items: P_ITEMS(), lineOrder });
    expect(lineOrderAfterMove(second, second, "욕실", "r5:rq5", "r3:rq3")).toStrictEqual([
      "r2:rq2",
      "r1:rq1",
      "r5:rq5",
      "r3:rq3",
      "r4:rq4",
    ]);
  });

  it("끄는 동안 R1이 지워지고 R6(도배)이 생기면: R1 key 없음, R6은 도배 묶음 끝", () => {
    const snapshot = groupsOf({ items: P_ITEMS() });
    const [, r2, r3, r4, r5] = P_ITEMS();
    const current = groupsOf({ items: [r2, r3, r4, r5, wallpaperRow(6)] });
    // 스냅샷 [R1, R2] → R1 위로 R2 → [R2, R1] → R1은 걷히고 R6이 붙는다
    expect(lineOrderAfterMove(snapshot, current, "도배", "r2:rq2", "r1:rq1")).toStrictEqual([
      "r2:rq2",
      "r6:rq6",
      "r3:rq3",
      "r4:rq4",
      "r5:rq5",
    ]);
  });

  it("null(쓰지 않음): 제자리, 다른 묶음의 over, 없는 key, 든 줄이 사라짐·구분이 바뀜", () => {
    const groups = groupsOf({ items: P_ITEMS() });
    expect(lineOrderAfterMove(groups, groups, "도배", "r1:rq1", "r1:rq1")).toBeNull();
    expect(lineOrderAfterMove(groups, groups, "도배", "r2:rq2", "r3:rq3")).toBeNull();
    expect(lineOrderAfterMove(groups, groups, "도배", "r2:rq2", "gone:q")).toBeNull();
    const [r1, r2, ...rest] = P_ITEMS();
    const removed = groupsOf({ items: [r1, ...rest] });
    expect(lineOrderAfterMove(groups, removed, "도배", "r2:rq2", "r1:rq1")).toBeNull();
    const moved = groupsOf({ items: [r1, { ...r2, trade: "욕실" }, ...rest] });
    expect(lineOrderAfterMove(groups, moved, "도배", "r2:rq2", "r1:rq1")).toBeNull();
  });

  it("줄 500개(항목 100 × 견적 5)에서도 출력이 parseLineOrder를 통과하고 길이 = 줄 수", () => {
    const items: InteriorItem[] = Array.from({ length: INTERIOR_ITEM_MAX_COUNT }, (_, index) => ({
      id: `i${index}`,
      spaceId: "sp-whole",
      trade: index % 2 === 0 ? "도배" : "욕실",
      quotes: Array.from({ length: INTERIOR_QUOTE_MAX_COUNT }, (_, quoteIndex) => ({
        id: `q${quoteIndex}`,
        vendor: "업체",
      })),
      status: "planned",
      createdAt: simpleTime(0),
      updatedAt: simpleTime(0),
    }));
    const groups = groupsOf({ items, lineOrder: ["i0:", "gone:q"] });
    const lineOrder = lineOrderAfterMove(groups, groups, "욕실", "i99:q4", "i1:q0");
    expect(lineOrder).toHaveLength(500);
    expect(parseLineOrder(lineOrder)).toStrictEqual(lineOrder);
  });

  it("왕복: 묶음 안 이동 결과를 다시 읽으면 그 묶음만 옮긴 목록", () => {
    const groups = groupsOf({ items: P_ITEMS() });
    const lineOrder = lineOrderAfterMove(groups, groups, "욕실", "r3:rq3", "r5:rq5");
    expect(orderOf({ items: P_ITEMS(), lineOrder: lineOrder ?? P_ORDER })).toStrictEqual([
      ["도배", ["r1:rq1", "r2:rq2"]],
      ["욕실", ["r4:rq4", "r5:rq5", "r3:rq3"]],
    ]);
  });
});

describe("로컬 계획 만들기는 lineOrder를 버린다(서버 계획 POST와 같다, ADR-036 조건 3)", () => {
  it("createPlan에 lineOrder를 보내도 만들어지고 원문에 lineOrder 키가 없다", () => {
    const storage = createMemoryStorage();
    const store = createInteriorPlanStore({
      storage,
      createId: () => "new1",
      now: () => simpleTime(40),
    });
    const result = store.createPlan({
      name: "새 계획",
      spaces: [{ id: "sp-whole", name: "전체" }],
      lineOrder: ["r1:rq1"],
    });
    expect(result.ok && Object.hasOwn(result.plan, "lineOrder")).toBe(false);
    const stored = JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY) ?? "null") as {
      plans: InteriorPlanWithItems[];
    };
    expect(stored.plans).toHaveLength(1);
    expect(Object.hasOwn(stored.plans[0], "lineOrder")).toBe(false);
  });
});
