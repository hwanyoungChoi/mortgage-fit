import { INTERIOR_PLAN_TBD_LABEL } from "@/lib/constants/interiorPlanTable";

import type { InteriorItem, InteriorPlanWithItems, InteriorQuote } from "@/lib/types/interiorPlan";

/**
 * 화면의 줄 하나 = (항목, 견적) 한 쌍(ADR-032 D1 A). 옛 항목의 견적 n개는 n줄이고, 견적 0개 항목은 빈 줄 하나다(U9).
 * 저장 형식은 그대로이고 이 모양은 저장하지 않는다(ADR-007).
 */
export type InteriorPlanRow = {
  /** React key이자 줄 찾기 값 `item.id:quote.id`(빈 줄은 `item.id:`). 인덱스가 아니다 */
  key: string;
  /** 그 줄의 항목 전체(쓰기는 이 항목의 숨은 값을 그대로 돌려보낸다) */
  item: InteriorItem;
  /** 그 줄의 견적. 견적 0개 항목의 빈 줄이면 null */
  quote: InteriorQuote | null;
  /** `item.confirmedQuoteId === quote.id` */
  isConfirmed: boolean;
  /** 빈 줄의 비고에 덧붙이는 항목 예산(만원). 표시용이라 저장하지 않는다. 그 밖의 줄은 null */
  budgetNote: number | null;
};

/** 구분 묶음 하나. 구분은 앞뒤 공백을 뗀 문자열이 정확히 같은 줄끼리다(대소문자 구분, 정규화 없음, A3) */
export type InteriorPlanRowGroup = {
  trade: string;
  rows: InteriorPlanRow[];
};

export type InteriorPlanRows = {
  /** 그 구분의 가장 이른 줄 순, 묶음 안은 항목 순 → 견적 순(U5) */
  groups: InteriorPlanRowGroup[];
  /** 지출 예정 = Σ(확정이고 금액이 있는 줄의 견적, 만원) */
  plannedTotal: number;
  /** 확정이고 금액이 없는(미정) 줄 수. 미확정 미정 줄은 세지 않는다(U2) */
  tbdCount: number;
};

export type InteriorPlanSummary = {
  /** 총 예산. 없으면 null("총 예산 입력") */
  budget: number | null;
  /** 지출 예정 */
  plannedTotal: number;
  /** 지출 예정에서 빠진 확정 미정 줄 수 */
  tbdCount: number;
  /** 총 예산 − 지출 예정. 음수면 예산 초과, 0이면 남은 예산 0. 총 예산이 없으면 null */
  remaining: number | null;
};

function rowsOfItem(item: InteriorItem): InteriorPlanRow[] {
  const quotes = item.quotes ?? [];
  if (quotes.length === 0) {
    return [
      {
        key: `${item.id}:`,
        item,
        quote: null,
        isConfirmed: false,
        budgetNote: item.budget ?? null,
      },
    ];
  }
  return quotes.map((quote) => ({
    key: `${item.id}:${quote.id}`,
    item,
    quote,
    isConfirmed: item.confirmedQuoteId === quote.id,
    budgetNote: null,
  }));
}

/**
 * 계획 → 공정(구분)별 줄 묶음과 지출 예정·미정 건수. 항목 목록 순서(로컬 배열 = 서버 `created_at, id`)로 펼친 줄에서
 * 묶음은 처음 나온 순이라, 앞 줄을 지우면 묶음 순서가 바뀔 수 있다. 목록·표·CSV·인쇄·홈이 모두 이 결과를 쓴다.
 * 확정 줄은 "금액이 있는가" 한 가지로 나눈다: 있으면 지출 예정에 더하고, 없으면(미정) 건수만 센다(ADR-033).
 */
export function buildInteriorPlanRows(
  plan: Pick<InteriorPlanWithItems, "items">,
): InteriorPlanRows {
  const groups = new Map<string, InteriorPlanRow[]>();
  for (const row of plan.items.flatMap(rowsOfItem)) {
    const trade = row.item.trade.trim();
    groups.set(trade, [...(groups.get(trade) ?? []), row]);
  }
  const confirmedQuotes = [...groups.values()]
    .flat()
    .flatMap((row) => (row.isConfirmed && row.quote !== null ? [row.quote] : []));
  const confirmedAmounts = confirmedQuotes.flatMap((quote) =>
    quote.amount === undefined ? [] : [quote.amount],
  );
  return {
    groups: Array.from(groups, ([trade, rows]) => ({ trade, rows })),
    plannedTotal: confirmedAmounts.reduce((total, amount) => total + amount, 0),
    tbdCount: confirmedQuotes.length - confirmedAmounts.length,
  };
}

/** "금액 미정 n건 제외"(요약·표 머리·계 비고·CSV 공통 문구). 0건이면 "" */
export function tbdExclusionNote(tbdCount: number): string {
  return tbdCount === 0 ? "" : `금액 ${INTERIOR_PLAN_TBD_LABEL} ${tbdCount}건 제외`;
}

/** 비고 조각을 잇는 구분자(앞뒤 공백 포함 가운뎃점) */
const NOTE_SEPARATOR = " · ";

/**
 * 줄의 비고 = 항목 메모 · (빈 줄이면) "예산 {금액}". 금액 표기는 부르는 쪽이 정한다(표·CSV·인쇄는 원). 목록은 비고를 그리지 않는다.
 * 표시용이라 저장하지 않는다. 시트의 비고 칸은 `item.memo`만 쓴다(합성 비고 미저장).
 */
export function rowNoteOf(row: InteriorPlanRow, formatBudget: (manwon: number) => string): string {
  const memo = row.item.memo ?? "";
  const pieces = [memo, row.budgetNote === null ? "" : `예산 ${formatBudget(row.budgetNote)}`];
  return pieces.filter((piece) => piece !== "").join(NOTE_SEPARATOR);
}

/**
 * 요약(총 예산·지출 예정·미정 건수·남은 예산). 남은 예산도 미정 줄을 더하지 않는다.
 * 저장하지 않고 매번 계산한다(ADR-007). 날짜에 의존하지 않는다
 */
export function summarizeInteriorPlan(plan: InteriorPlanWithItems): InteriorPlanSummary {
  const { plannedTotal, tbdCount } = buildInteriorPlanRows(plan);
  const budget = plan.budget ?? null;
  return {
    budget,
    plannedTotal,
    tbdCount,
    remaining: budget === null ? null : budget - plannedTotal,
  };
}
