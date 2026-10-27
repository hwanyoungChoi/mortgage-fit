import { WON_PER_MANWON } from "@/lib/constants/interiorPlan";
import { INTERIOR_PLAN_TBD_LABEL } from "@/lib/constants/interiorPlanTable";

import { formatWon } from "./amount";

import type {
  InteriorItem,
  InteriorPlan,
  InteriorPlanWithItems,
  InteriorQuote,
} from "@/lib/types/interiorPlan";

// 금액을 원으로 읽는 곳은 이 파일 하나다(ADR-034 조건 2). 옛 키(견적 `amount`·총 예산 `budget`·항목 `budget`, 만원)는
// 여기서만 × 10,000 하고, 목록·요약·허브·표·CSV는 원만 본다. 0은 금액이 정해진 0이라 키 있음/없음으로만 나눈다(truthy 판정 금지).

/** 견적 금액(원). `amountWon`이 있으면 그 값, 옛 `amount`(만원)면 × 10,000, 둘 다 없으면 미정(undefined) */
export function quoteWonOf(quote: Pick<InteriorQuote, "amount" | "amountWon">): number | undefined {
  if (quote.amountWon !== undefined) return quote.amountWon;
  return quote.amount === undefined ? undefined : quote.amount * WON_PER_MANWON;
}

/** 총 예산(원). `budgetWon`이 있으면 그 값, 옛 `budget`(만원)면 × 10,000, 둘 다 없으면 없음(undefined) */
export function planBudgetWonOf(
  plan: Pick<InteriorPlan, "budget" | "budgetWon">,
): number | undefined {
  if (plan.budgetWon !== undefined) return plan.budgetWon;
  return plan.budget === undefined ? undefined : plan.budget * WON_PER_MANWON;
}

/** 항목 예산(원). 항목 예산은 만원 키 하나뿐이다 */
function itemBudgetWonOf(item: Pick<InteriorItem, "budget">): number | null {
  return item.budget === undefined ? null : item.budget * WON_PER_MANWON;
}

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
  /** 견적 금액(원, `quoteWonOf`). 견적 없는 줄과 금액 미정 견적은 undefined(둘은 `quote`로 가른다) */
  quoteWon: number | undefined;
  /** `item.confirmedQuoteId === quote.id` */
  isConfirmed: boolean;
  /** 빈 줄의 비고에 덧붙이는 항목 예산(원). 표시용이라 저장하지 않는다. 그 밖의 줄은 null */
  budgetNoteWon: number | null;
};

/** 구분 묶음 하나. 구분은 앞뒤 공백을 뗀 문자열이 정확히 같은 줄끼리다(대소문자 구분, 정규화 없음, A3) */
export type InteriorPlanRowGroup = {
  trade: string;
  rows: InteriorPlanRow[];
};

export type InteriorPlanRows = {
  /** 그 구분의 가장 이른 줄 순, 묶음 안은 항목 순 → 견적 순(U5) */
  groups: InteriorPlanRowGroup[];
  /** 지출 예정(원) = Σ(확정이고 금액이 있는 줄의 견적) */
  plannedTotalWon: number;
  /** 확정이고 금액이 없는(미정) 줄 수. 미확정 미정 줄은 세지 않는다(U2) */
  tbdCount: number;
};

export type InteriorPlanSummary = {
  /** 총 예산(원). 없으면 null("총 예산 입력") */
  budgetWon: number | null;
  /** 지출 예정(원) */
  plannedTotalWon: number;
  /** 지출 예정에서 빠진 확정 미정 줄 수 */
  tbdCount: number;
  /** 총 예산 − 지출 예정(원). 음수면 예산 초과, 0이면 남은 예산 0. 총 예산이 없으면 null */
  remainingWon: number | null;
};

function rowsOfItem(item: InteriorItem): InteriorPlanRow[] {
  const quotes = item.quotes ?? [];
  if (quotes.length === 0) {
    return [
      {
        key: `${item.id}:`,
        item,
        quote: null,
        quoteWon: undefined,
        isConfirmed: false,
        budgetNoteWon: itemBudgetWonOf(item),
      },
    ];
  }
  return quotes.map((quote) => ({
    key: `${item.id}:${quote.id}`,
    item,
    quote,
    quoteWon: quoteWonOf(quote),
    isConfirmed: item.confirmedQuoteId === quote.id,
    budgetNoteWon: null,
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
  const confirmedRows = [...groups.values()]
    .flat()
    .filter((row) => row.isConfirmed && row.quote !== null);
  const confirmedWons = confirmedRows.flatMap((row) =>
    row.quoteWon === undefined ? [] : [row.quoteWon],
  );
  return {
    groups: Array.from(groups, ([trade, rows]) => ({ trade, rows })),
    plannedTotalWon: confirmedWons.reduce((total, won) => total + won, 0),
    tbdCount: confirmedRows.length - confirmedWons.length,
  };
}

/** "금액 미정 n건 제외"(요약·표 머리·계 비고·CSV 공통 문구). 0건이면 "" */
export function tbdExclusionNote(tbdCount: number): string {
  return tbdCount === 0 ? "" : `금액 ${INTERIOR_PLAN_TBD_LABEL} ${tbdCount}건 제외`;
}

/** 비고 조각을 잇는 구분자(앞뒤 공백 포함 가운뎃점) */
const NOTE_SEPARATOR = " · ";

/**
 * 줄의 비고 = 항목 메모 · (빈 줄이면) "예산 2,000,000원". 표·CSV·인쇄가 쓰고 목록은 비고를 그리지 않는다.
 * 표시용이라 저장하지 않는다. 시트의 비고 칸은 `item.memo`만 쓴다(합성 비고 미저장).
 */
export function rowNoteOf(row: InteriorPlanRow): string {
  const memo = row.item.memo ?? "";
  const pieces = [memo, row.budgetNoteWon === null ? "" : `예산 ${formatWon(row.budgetNoteWon)}`];
  return pieces.filter((piece) => piece !== "").join(NOTE_SEPARATOR);
}

/**
 * 요약(총 예산·지출 예정·미정 건수·남은 예산). 남은 예산도 미정 줄을 더하지 않는다.
 * 저장하지 않고 매번 계산한다(ADR-007). 날짜에 의존하지 않는다
 */
export function summarizeInteriorPlan(plan: InteriorPlanWithItems): InteriorPlanSummary {
  const { plannedTotalWon, tbdCount } = buildInteriorPlanRows(plan);
  const budgetWon = planBudgetWonOf(plan) ?? null;
  return {
    budgetWon,
    plannedTotalWon,
    tbdCount,
    remainingWon: budgetWon === null ? null : budgetWon - plannedTotalWon,
  };
}
