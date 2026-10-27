import { INTERIOR_NO_SPACE_LABEL } from "@/lib/constants/interiorSpaces";

import { sortInteriorTrades } from "./sortInteriorTrades";
import { toLocalDateString } from "./toLocalDateString";

import type {
  InteriorItem,
  InteriorPayment,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";

/** 항목 하나의 계산값. 금액은 모두 만원 정수 */
export type InteriorItemLine = {
  item: InteriorItem;
  /** 그 항목의 공간 이름. 플랜에 없는 공간이면 null("공간 없음") */
  spaceName: string | null;
  /** 확정한 견적의 금액. 확정 안 했으면 null */
  confirmedAmount: number | null;
  /** 예상 금액 = 확정 금액, 없으면 예산. 둘 다 없으면 null(합계에는 0) */
  expectedAmount: number | null;
  /** 확정 금액 − 예산이 0보다 크면 그 값("n만원 초과"), 아니면 null */
  overBudget: number | null;
};

/** 공간별·공종별 묶음 하나 */
export type InteriorItemGroup = {
  /** 공간 id, 공종 이름, 또는 공간 없음 묶음의 `NO_SPACE_GROUP_ID` */
  id: string;
  label: string;
  /** 묶음 안 예상 금액의 합 */
  total: number;
  lines: InteriorItemLine[];
};

/** 할 일 "지급 예정" 한 줄: 지급함이 아닌 지급 줄 */
export type InteriorPaymentTodo = {
  line: InteriorItemLine;
  payment: InteriorPayment;
  /** 지급 예정일이 오늘보다 앞이다("지남") */
  isOverdue: boolean;
};

export type InteriorPlanSummary = {
  /** 총 예산. 없으면 null("총 예산 입력") */
  budget: number | null;
  /** Σ(확정 금액, 없으면 예산) */
  expectedTotal: number;
  /** 총 예산 − 예상 총액. 음수면 예산 초과. 총 예산이 없으면 null */
  remaining: number | null;
  /** 확정 항목의 확정 금액 합 */
  confirmedTotal: number;
  /** 모든 지급함 줄의 합(확정 안 된 항목 포함) */
  paidTotal: number;
  /** 확정 항목별 max(확정 금액 − 그 항목 지급함 합, 0)의 합(ADR-029 조건 9) */
  upcomingTotal: number;
  /** 플랜 공간 순서. 항목 없는 공간은 빼고, 공간 없는 항목은 맨 뒤 "공간 없음" */
  spaceGroups: InteriorItemGroup[];
  /** 공정 순서(프리셋), 직접 입력 공종은 맨 뒤 입력순 */
  tradeGroups: InteriorItemGroup[];
  /** 지급 예정일 순(날짜 없는 줄은 맨 뒤, 그 안은 항목·줄 순서) */
  paymentTodos: InteriorPaymentTodo[];
  /** 견적 0개이고 확정 안 한 항목 */
  quoteTodos: InteriorItemLine[];
  /** 견적 1개 이상이고 확정 안 한 항목 */
  confirmTodos: InteriorItemLine[];
};

export const NO_SPACE_GROUP_ID = "noSpace";

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** 확정한 견적의 금액. 확정 안 했거나 그 견적이 없으면 null */
export function confirmedAmountOf(item: Pick<InteriorItem, "quotes" | "confirmedQuoteId">) {
  const quote = item.quotes?.find((candidate) => candidate.id === item.confirmedQuoteId);
  return quote?.amount ?? null;
}

function paidAmountOf(item: InteriorItem): number {
  return sum((item.payments ?? []).filter((payment) => payment.isPaid).map(({ amount }) => amount));
}

function toLine(item: InteriorItem, spaceNames: Map<string, string>): InteriorItemLine {
  const confirmedAmount = confirmedAmountOf(item);
  const excess =
    confirmedAmount !== null && item.budget !== undefined ? confirmedAmount - item.budget : 0;
  return {
    item,
    spaceName: spaceNames.get(item.spaceId) ?? null,
    confirmedAmount,
    expectedAmount: confirmedAmount ?? item.budget ?? null,
    overBudget: excess > 0 ? excess : null,
  };
}

function toGroup(id: string, label: string, lines: InteriorItemLine[]): InteriorItemGroup {
  return { id, label, total: sum(lines.map((line) => line.expectedAmount ?? 0)), lines };
}

function groupBySpace(plan: InteriorPlanWithItems, lines: InteriorItemLine[]) {
  const groups = plan.spaces.map((space) =>
    toGroup(
      space.id,
      space.name,
      lines.filter((line) => line.item.spaceId === space.id),
    ),
  );
  const noSpace = lines.filter((line) => line.spaceName === null);
  return [...groups, toGroup(NO_SPACE_GROUP_ID, INTERIOR_NO_SPACE_LABEL, noSpace)].filter(
    (group) => group.lines.length > 0,
  );
}

function groupByTrade(lines: InteriorItemLine[]) {
  return sortInteriorTrades(lines.map((line) => line.item)).map((trade) =>
    toGroup(
      trade,
      trade,
      lines.filter((line) => line.item.trade === trade),
    ),
  );
}

/** 날짜순. 날짜 없는 줄은 맨 뒤이고, 같은 날짜끼리는 원래 순서(안정 정렬) */
function compareDueDate(a: InteriorPaymentTodo, b: InteriorPaymentTodo): number {
  const left = a.payment.dueDate;
  const right = b.payment.dueDate;
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return left < right ? -1 : 1;
}

/**
 * 플랜 요약(스펙 "수용 기준"의 계산 정의). 합계·초과·할 일은 저장하지 않고 매번 계산한다(ADR-007).
 * `now`는 "지남" 판단의 기준(기기 오늘)이고 테스트에서 주입한다. 금액은 만원 정수 덧셈·뺄셈뿐이다.
 */
export function summarizeInteriorPlan(plan: InteriorPlanWithItems, now: Date): InteriorPlanSummary {
  const today = toLocalDateString(now);
  const spaceNames = new Map(plan.spaces.map((space) => [space.id, space.name]));
  const lines = plan.items.map((item) => toLine(item, spaceNames));
  const confirmedLines = lines.filter((line) => line.confirmedAmount !== null);
  const expectedTotal = sum(lines.map((line) => line.expectedAmount ?? 0));
  const budget = plan.budget ?? null;

  const paymentTodos = lines
    .flatMap((line) =>
      (line.item.payments ?? [])
        .filter((payment) => !payment.isPaid)
        .map((payment) => ({
          line,
          payment,
          isOverdue: payment.dueDate !== undefined && payment.dueDate < today,
        })),
    )
    .toSorted(compareDueDate);
  const unconfirmedLines = lines.filter((line) => line.confirmedAmount === null);

  return {
    budget,
    expectedTotal,
    remaining: budget === null ? null : budget - expectedTotal,
    confirmedTotal: sum(confirmedLines.map((line) => line.confirmedAmount ?? 0)),
    paidTotal: sum(plan.items.map(paidAmountOf)),
    upcomingTotal: sum(
      confirmedLines.map((line) =>
        Math.max((line.confirmedAmount ?? 0) - paidAmountOf(line.item), 0),
      ),
    ),
    spaceGroups: groupBySpace(plan, lines),
    tradeGroups: groupByTrade(lines),
    paymentTodos,
    quoteTodos: unconfirmedLines.filter((line) => (line.item.quotes ?? []).length === 0),
    confirmTodos: unconfirmedLines.filter((line) => (line.item.quotes ?? []).length > 0),
  };
}
