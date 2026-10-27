import { describe, expect, it } from "vitest";

import {
  confirmSashD,
  makePlanP,
  paySashBalance,
  pTime,
  withItem,
} from "@/test/interiorPlanFixture";

import {
  confirmedAmountOf,
  NO_SPACE_GROUP_ID,
  summarizeInteriorPlan,
} from "./summarizeInteriorPlan";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

/** AC-4의 기기 날짜. 로컬 시각으로 만들어 시간대와 상관없이 2026-11-10이다 */
const NOV_10 = new Date(2026, 10, 10, 12, 0, 0);

const summarize = (plan: InteriorPlanWithItems, now = NOV_10) => summarizeInteriorPlan(plan, now);

const groupTotals = (groups: { label: string; total: number }[]) =>
  groups.map(({ label, total }) => [label, total]);

const overBudgetOf = (plan: InteriorPlanWithItems, itemId: string) =>
  summarize(plan)
    .spaceGroups.flatMap((group) => group.lines)
    .find((line) => line.item.id === itemId)?.overBudget;

describe("AC-2 요약 계산 (플랜 P)", () => {
  const summary = summarize(makePlanP());

  it("예상 총액 = Σ(확정 금액, 없으면 예산) = 280+600+1,250+500 = 2,630", () => {
    expect(summary.expectedTotal).toBe(2630);
  });

  it("남은 예산 = 3,000 − 2,630 = 370, 총 예산 3,000", () => {
    expect(summary.budget).toBe(3000);
    expect(summary.remaining).toBe(370);
  });

  it("확정 = 280 + 1,250 = 1,530", () => {
    expect(summary.confirmedTotal).toBe(1530);
  });

  it("지급함 = 30 + 250 = 280", () => {
    expect(summary.paidTotal).toBe(280);
  });

  it("앞으로 낼 돈 = ① 280−30=250 + ③ 1,250−250=1,000 = 1,250", () => {
    expect(summary.upcomingTotal).toBe(1250);
  });

  it("항목 ③ 샷시만 50만원 초과다(① 280 < 300, ② 미확정 650은 초과로 보지 않는다)", () => {
    const lines = summary.spaceGroups.flatMap((group) => group.lines);
    expect(Object.fromEntries(lines.map((line) => [line.item.trade, line.overBudget]))).toEqual({
      샷시: 50,
      도배: null,
      주방가구: null,
      타일: null,
    });
  });

  it("총 예산을 2,500으로 바꾸면 남은 예산 −130(예산 초과 130만원)", () => {
    expect(summarize(makePlanP({ budget: 2500 })).remaining).toBe(-130);
  });

  it("총 예산이 없으면 budget·remaining이 null이고 나머지 합계는 같다", () => {
    const { budget: _budget, ...withoutBudget } = makePlanP();
    void _budget;
    const result = summarize({ ...withoutBudget });
    expect(result.budget).toBeNull();
    expect(result.remaining).toBeNull();
    expect(result.expectedTotal).toBe(2630);
    expect(result.upcomingTotal).toBe(1250);
  });

  it("총 예산 = 예상 총액이면 남은 예산 0(음수 아님)", () => {
    expect(summarize(makePlanP({ budget: 2630 })).remaining).toBe(0);
    expect(summarize(makePlanP({ budget: 2629 })).remaining).toBe(-1);
  });
});

describe("AC-3 공간별·공종별 묶음", () => {
  it("공간별은 플랜 공간 순서이고 항목 없는 공간은 숨긴다: 전체 1,250 · 거실 280 · 주방 500 · 욕실1 600", () => {
    expect(groupTotals(summarize(makePlanP()).spaceGroups)).toEqual([
      ["전체", 1250],
      ["거실", 280],
      ["주방", 500],
      ["욕실1", 600],
    ]);
  });

  it("공간 묶음 id는 공간 id다", () => {
    expect(summarize(makePlanP()).spaceGroups.map((group) => group.id)).toEqual([
      "sp-all",
      "sp-living",
      "sp-kitchen",
      "sp-bath1",
    ]);
  });

  it("공간 순서를 바꾸면 묶음 순서도 따라간다(항목 순서가 아니라 공간 순서)", () => {
    const plan = makePlanP();
    const reversed = { ...plan, spaces: plan.spaces.toReversed() };
    expect(summarize(reversed).spaceGroups.map((group) => group.label)).toEqual([
      "욕실1",
      "주방",
      "거실",
      "전체",
    ]);
  });

  it("공간이 사라진 항목은 맨 뒤 '공간 없음' 묶음에 들어가고 spaceName은 null이다(A6)", () => {
    const plan = makePlanP();
    const orphan = { ...plan, spaces: plan.spaces.filter((space) => space.id !== "sp-living") };
    const groups = summarize(orphan).spaceGroups;
    expect(groupTotals(groups)).toEqual([
      ["전체", 1250],
      ["주방", 500],
      ["욕실1", 600],
      ["공간 없음", 280],
    ]);
    expect(groups.at(-1)?.id).toBe(NO_SPACE_GROUP_ID);
    expect(groups.at(-1)?.lines[0].spaceName).toBeNull();
    // 요약 합계에서도 빠지지 않는다
    expect(summarize(orphan).expectedTotal).toBe(2630);
  });

  it("공간 없는 항목이 없으면 '공간 없음' 묶음은 없다", () => {
    expect(summarize(makePlanP()).spaceGroups.some((group) => group.id === NO_SPACE_GROUP_ID)).toBe(
      false,
    );
  });

  it("공종별은 공정 순서: 샷시 → 타일 → 도배 → 주방가구(항목 순서 ①②③④와 다르다)", () => {
    expect(groupTotals(summarize(makePlanP()).tradeGroups)).toEqual([
      ["샷시", 1250],
      ["타일", 600],
      ["도배", 280],
      ["주방가구", 500],
    ]);
  });

  it("직접 입력 공종은 맨 뒤 입력순: 방충망을 먼저, 단열을 나중에 만들면 방충망 → 단열", () => {
    const custom = (id: string, trade: string, minute: number): InteriorItem => ({
      id,
      spaceId: "sp-veranda",
      trade,
      budget: 10,
      status: "planned",
      createdAt: pTime(minute),
      updatedAt: pTime(minute),
    });
    const plan = makePlanP();
    // 목록 순서는 단열이 먼저지만 만든 시각은 방충망이 먼저다
    const withCustom = {
      ...plan,
      items: [custom("c-insulation", "단열", 20), ...plan.items, custom("c-screen", "방충망", 10)],
    };
    expect(summarize(withCustom).tradeGroups.map((group) => group.label)).toEqual([
      "샷시",
      "타일",
      "도배",
      "주방가구",
      "방충망",
      "단열",
    ]);
  });

  it("같은 공종 항목 둘은 한 묶음에 합친다", () => {
    const plan = makePlanP();
    const second: InteriorItem = {
      id: "item-wallpaper-2",
      spaceId: "sp-room1",
      trade: "도배",
      budget: 120,
      status: "planned",
      createdAt: pTime(5),
      updatedAt: pTime(5),
    };
    const groups = summarize({ ...plan, items: [...plan.items, second] }).tradeGroups;
    const wallpaper = groups.find((group) => group.label === "도배");
    expect(wallpaper?.total).toBe(400);
    expect(wallpaper?.lines.map((line) => line.item.id)).toEqual([
      "item-wallpaper",
      "item-wallpaper-2",
    ]);
  });

  it("예산도 확정도 없는 항목은 expectedAmount null, 합계에는 0으로 든다", () => {
    const plan = makePlanP();
    const empty: InteriorItem = {
      id: "item-empty",
      spaceId: "sp-room2",
      trade: "조명",
      status: "planned",
      createdAt: pTime(6),
      updatedAt: pTime(6),
    };
    const summary = summarize({ ...plan, items: [...plan.items, empty] });
    const group = summary.spaceGroups.find((candidate) => candidate.label === "방2");
    expect(group?.total).toBe(0);
    expect(group?.lines[0].expectedAmount).toBeNull();
    expect(summary.expectedTotal).toBe(2630);
  });

  it("항목이 없으면 묶음·할 일이 비고 합계는 0", () => {
    const summary = summarize(makePlanP({ items: [] }));
    expect(summary.spaceGroups).toEqual([]);
    expect(summary.tradeGroups).toEqual([]);
    expect(summary.paymentTodos).toEqual([]);
    expect(summary.expectedTotal).toBe(0);
    expect(summary.remaining).toBe(3000);
    expect(summary.upcomingTotal).toBe(0);
  });
});

describe("초과(항목 줄) 경계", () => {
  it("확정 금액 = 예산이면 초과 아님, 예산 + 1이면 1만원 초과", () => {
    const equal = withItem(makePlanP(), "item-sash", (item) => ({ ...item, budget: 1250 }));
    const oneOver = withItem(makePlanP(), "item-sash", (item) => ({ ...item, budget: 1249 }));
    expect(overBudgetOf(equal, "item-sash")).toBeNull();
    expect(overBudgetOf(oneOver, "item-sash")).toBe(1);
  });

  it("예산이 없으면 확정 금액이 있어도 초과 아님", () => {
    const plan = withItem(makePlanP(), "item-sash", ({ budget: _budget, ...item }) => {
      void _budget;
      return item;
    });
    expect(overBudgetOf(plan, "item-sash")).toBeNull();
  });
});

describe("AC-4 할 일 (now = 2026-11-10)", () => {
  const summary = summarize(makePlanP());

  it("지급 예정: 샷시 잔금 1,000(11-05, 지남) → 도배 잔금 250(11-20) 순", () => {
    expect(
      summary.paymentTodos.map(({ line, payment, isOverdue }) => [
        line.item.trade,
        payment.label,
        payment.amount,
        payment.dueDate,
        isOverdue,
      ]),
    ).toEqual([
      ["샷시", "잔금", 1000, "2026-11-05", true],
      ["도배", "잔금", 250, "2026-11-20", false],
    ]);
  });

  it("견적 받기: 주방가구(견적 0개·미확정)", () => {
    expect(summary.quoteTodos.map((line) => line.item.trade)).toEqual(["주방가구"]);
  });

  it("확정하기: 타일(견적 1개 이상·미확정)", () => {
    expect(summary.confirmTodos.map((line) => line.item.trade)).toEqual(["타일"]);
  });

  it("'지남'은 오늘보다 앞일 때만: 11-05 당일은 지남 아님, 11-06부터 지남", () => {
    const overdueOf = (now: Date) =>
      summarize(makePlanP(), now).paymentTodos.find(
        (todo) => todo.payment.id === "pay-sash-balance",
      )?.isOverdue;
    expect(overdueOf(new Date(2026, 10, 5, 0, 0, 0))).toBe(false);
    expect(overdueOf(new Date(2026, 10, 5, 23, 59, 59))).toBe(false);
    expect(overdueOf(new Date(2026, 10, 6, 0, 0, 0))).toBe(true);
  });

  it("날짜 없는 지급 줄은 맨 뒤, 같은 날짜는 원래 순서", () => {
    const plan = withItem(makePlanP(), "item-kitchen", (item) => ({
      ...item,
      payments: [
        { id: "k-1", label: "직접", amount: 10, isPaid: false },
        { id: "k-2", label: "같은날", amount: 20, dueDate: "2026-11-05", isPaid: false },
      ],
    }));
    expect(summarize(plan).paymentTodos.map((todo) => todo.payment.id)).toEqual([
      "pay-sash-balance",
      "k-2",
      "pay-wallpaper-balance",
      "k-1",
    ]);
  });

  it("샷시 잔금을 지급함으로 바꾸면(E 확정 그대로) 그 줄이 사라지고 지급함 1,280, 앞으로 낼 돈 250", () => {
    const paid = summarize(withItem(makePlanP(), "item-sash", paySashBalance));
    expect(paid.paymentTodos.map((todo) => todo.payment.id)).toEqual(["pay-wallpaper-balance"]);
    expect(paid.paidTotal).toBe(1280);
    expect(paid.upcomingTotal).toBe(250);
    expect(paid.confirmedTotal).toBe(1530);
  });
});

describe("AC-4 앞으로 낼 돈 정의를 가르는 값 (ADR-029 조건 9)", () => {
  it("(a) 견적 D만 확정(잔금 미지급): 확정 1,430, 50만원 초과 사라짐, 지급함 280, 앞으로 낼 돈 1,150", () => {
    const plan = withItem(makePlanP(), "item-sash", confirmSashD);
    const summary = summarize(plan);
    expect(summary.confirmedTotal).toBe(1430);
    expect(overBudgetOf(plan, "item-sash")).toBeNull();
    expect(summary.paidTotal).toBe(280);
    // ① 250 + ③ 1,150 − 250 = 900
    expect(summary.upcomingTotal).toBe(1150);
    expect(summary.expectedTotal).toBe(2530);
  });

  it("(b) 샷시 잔금 지급함 + 견적 D 확정: 확정 1,430, 지급함 1,280, 앞으로 낼 돈 250(과지급 항목은 0)", () => {
    const plan = withItem(makePlanP(), "item-sash", (item) => confirmSashD(paySashBalance(item)));
    const summary = summarize(plan);
    expect(summary.confirmedTotal).toBe(1430);
    expect(summary.paidTotal).toBe(1280);
    // ① 250 + ③ max(1,150 − 1,250, 0) = 0
    expect(summary.upcomingTotal).toBe(250);
  });

  it("확정 안 된 항목의 지급함 줄은 지급함에는 더하고 앞으로 낼 돈에서는 빼지 않는다", () => {
    const plan = withItem(makePlanP(), "item-tile", (item) => ({
      ...item,
      payments: [{ id: "t-1", label: "계약금", amount: 100, dueDate: "2026-11-02", isPaid: true }],
    }));
    const summary = summarize(plan);
    expect(summary.paidTotal).toBe(380);
    expect(summary.upcomingTotal).toBe(1250);
  });

  it("확정 안 된 항목의 미지급 줄은 앞으로 낼 돈에 더하지 않는다(할 일에는 보인다)", () => {
    const plan = withItem(makePlanP(), "item-tile", (item) => ({
      ...item,
      payments: [{ id: "t-2", label: "계약금", amount: 100, dueDate: "2026-11-30", isPaid: false }],
    }));
    const summary = summarize(plan);
    expect(summary.upcomingTotal).toBe(1250);
    expect(summary.paymentTodos.map((todo) => todo.payment.id)).toContain("t-2");
  });

  it("지급 줄이 없는 확정 항목은 확정 금액 전부가 앞으로 낼 돈이다", () => {
    const plan = withItem(makePlanP(), "item-tile", (item) => ({
      ...item,
      confirmedQuoteId: "q-c",
      status: "confirmed",
    }));
    expect(summarize(plan).upcomingTotal).toBe(1250 + 650);
  });
});

describe("확정 금액 읽기", () => {
  it("confirmedQuoteId의 견적 금액, 없거나 못 찾으면 null", () => {
    const quotes = [{ id: "x", vendor: "가", amount: 70 }];
    expect(confirmedAmountOf({ quotes, confirmedQuoteId: "x" })).toBe(70);
    expect(confirmedAmountOf({ quotes })).toBeNull();
    expect(confirmedAmountOf({ quotes, confirmedQuoteId: "y" })).toBeNull();
    expect(confirmedAmountOf({ confirmedQuoteId: "x" })).toBeNull();
  });

  it("확정 견적이 사라진 항목(확정 해제)은 미확정으로 계산되어 확정하기 할 일로 간다", () => {
    const plan = withItem(makePlanP(), "item-sash", ({ confirmedQuoteId: _id, ...item }) => {
      void _id;
      return item;
    });
    const summary = summarize(plan);
    expect(summary.confirmedTotal).toBe(280);
    expect(summary.expectedTotal).toBe(280 + 600 + 1200 + 500);
    expect(summary.confirmTodos.map((line) => line.item.trade)).toEqual(["타일", "샷시"]);
  });
});
