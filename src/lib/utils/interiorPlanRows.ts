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

/**
 * 견적의 업체 이름. 키가 없으면 업체 미정(null, ADR-036). "업체 있음/없음"은 이 함수 하나로 판단한다
 * (목록 줄·접근 가능한 이름·표 모델·시트 채우기가 모두 부른다, ADR-036 조건 8)
 */
export function vendorOf(quote: Pick<InteriorQuote, "vendor">): string | null {
  return quote.vendor ?? null;
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
  /** 구매 완료 = 확정 줄이고 항목 상태가 "done". 확정이 아닌 줄은 상태와 상관없이 false다 */
  isDone: boolean;
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
  /** 지출 예정(원) = Σ(확정이고 완료가 아니고 금액이 있는 줄의 견적) */
  plannedTotalWon: number;
  /** 지출 완료(원) = Σ(완료이고 금액이 있는 줄의 견적) */
  doneTotalWon: number;
  /** [완료] 줄 수(금액 미정 포함). 0이면 화면·표·CSV에 지출 완료를 그리지 않는다(완료를 안 쓰는 계획은 그대로) */
  doneCount: number;
  /** 확정이고 금액이 없는(미정) 줄 수(완료 줄 포함). 미확정 미정 줄은 세지 않는다(U2) */
  tbdCount: number;
};

export type InteriorPlanSummary = {
  /** 총 예산(원). 없으면 null("총 예산 입력") */
  budgetWon: number | null;
  /** 지출 예정(원) */
  plannedTotalWon: number;
  /** 지출 완료(원) */
  doneTotalWon: number;
  /** [완료] 줄 수 */
  doneCount: number;
  /** 지출 예정·완료에서 빠진 확정 미정 줄 수 */
  tbdCount: number;
  /** 총 예산 − 지출 예정 − 지출 완료(원). 음수면 예산 초과, 0이면 남은 예산 0. 총 예산이 없으면 null */
  remainingWon: number | null;
};

/** 견적 없는 줄의 key `item.id:`. 같은 항목 줄의 순서 대체 자리이기도 하다(ADR-036) */
const emptyLineKeyOf = (itemId: string) => `${itemId}:`;

function rowsOfItem(item: InteriorItem): InteriorPlanRow[] {
  const quotes = item.quotes ?? [];
  if (quotes.length === 0) {
    return [
      {
        key: emptyLineKeyOf(item.id),
        item,
        quote: null,
        quoteWon: undefined,
        isConfirmed: false,
        isDone: false,
        budgetNoteWon: itemBudgetWonOf(item),
      },
    ];
  }
  return quotes.map((quote) => {
    const isConfirmed = item.confirmedQuoteId === quote.id;
    return {
      key: `${item.id}:${quote.id}`,
      item,
      quote,
      quoteWon: quoteWonOf(quote),
      isConfirmed,
      isDone: isConfirmed && item.status === "done",
      budgetNoteWon: null,
    };
  });
}

/**
 * 줄 순서(`lineOrder`, ADR-036 D1 A)대로 놓은 줄. 줄의 자리는 자기 key의 자리, 없으면 같은 항목의 빈 줄 key `item.id:`의 자리
 * (견적 없는 줄에 업체를 채워 key가 바뀐 줄이 제자리에 있게), 그것도 없으면 자리 없음이다. 자리 있는 줄을 자리 순으로,
 * 그 뒤에 자리 없는 줄을 기본 순서로 놓는다(안정 정렬이라 같은 자리를 받은 줄은 기본 순서). 없는 줄의 key는 무시한다.
 */
function orderByLineOrder(
  rows: InteriorPlanRow[],
  lineOrder: string[] | undefined,
): InteriorPlanRow[] {
  if (lineOrder === undefined) return rows;
  const positions = new Map(lineOrder.map((key, index) => [key, index]));
  const unplaced = lineOrder.length;
  const positionOf = ({ key, item }: InteriorPlanRow) =>
    positions.get(key) ?? positions.get(emptyLineKeyOf(item.id)) ?? unplaced;
  return rows
    .map((row) => ({ row, position: positionOf(row) }))
    .sort((a, b) => a.position - b.position)
    .map(({ row }) => row);
}

/**
 * 계획 → 공정(구분)별 줄 묶음과 지출 예정·미정 건수. 항목 목록 순서(로컬 배열 = 서버 `created_at, id`)로 펼친 줄을
 * 줄 순서(`lineOrder`)대로 놓고, 묶음은 처음 나온 순이다(묶음 순서 = 그 묶음 줄의 가장 이른 자리). 그래서 새 줄은 그 묶음 끝,
 * 새 구분은 맨 끝 묶음이고(U5), 앞 줄을 지우면 묶음 순서가 바뀔 수 있다. 목록·표·CSV·인쇄·홈이 모두 이 결과를 쓴다.
 * 확정 줄은 "금액이 있는가" 한 가지로 나눈다: 있으면 지출 예정(완료 줄은 지출 완료)에 더하고, 없으면(미정) 건수만 센다(ADR-033).
 */
export function buildInteriorPlanRows(
  plan: Pick<InteriorPlanWithItems, "items" | "lineOrder">,
): InteriorPlanRows {
  const groups = new Map<string, InteriorPlanRow[]>();
  for (const row of orderByLineOrder(plan.items.flatMap(rowsOfItem), plan.lineOrder)) {
    const trade = row.item.trade.trim();
    groups.set(trade, [...(groups.get(trade) ?? []), row]);
  }
  const confirmedRows = [...groups.values()]
    .flat()
    .filter((row) => row.isConfirmed && row.quote !== null);
  const totalWonOf = (rows: InteriorPlanRow[]) =>
    rows.reduce((total, row) => total + (row.quoteWon ?? 0), 0);
  return {
    groups: Array.from(groups, ([trade, rows]) => ({ trade, rows })),
    plannedTotalWon: totalWonOf(confirmedRows.filter((row) => !row.isDone)),
    doneTotalWon: totalWonOf(confirmedRows.filter((row) => row.isDone)),
    doneCount: confirmedRows.filter((row) => row.isDone).length,
    tbdCount: confirmedRows.filter((row) => row.quoteWon === undefined).length,
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
 * 요약(총 예산·지출 예정·지출 완료·미정 건수·남은 예산). 남은 예산도 미정 줄을 더하지 않는다.
 * 저장하지 않고 매번 계산한다(ADR-007). 날짜에 의존하지 않는다
 */
export function summarizeInteriorPlan(plan: InteriorPlanWithItems): InteriorPlanSummary {
  const { plannedTotalWon, doneTotalWon, doneCount, tbdCount } = buildInteriorPlanRows(plan);
  const budgetWon = planBudgetWonOf(plan) ?? null;
  return {
    budgetWon,
    plannedTotalWon,
    doneTotalWon,
    doneCount,
    tbdCount,
    remainingWon: budgetWon === null ? null : budgetWon - plannedTotalWon - doneTotalWon,
  };
}
