import {
  INTERIOR_PLAN_TABLE_NOTES,
  INTERIOR_PLAN_TABLE_SEPARATOR,
  WON_PER_MANWON,
} from "@/lib/constants/interiorPlanTable";
import { INTERIOR_NO_SPACE_LABEL } from "@/lib/constants/interiorSpaces";

import { formatThousands } from "./amount";

import type { InteriorItemGroup, InteriorItemLine } from "./summarizeInteriorPlan";
import type { InteriorQuote } from "@/lib/types/interiorPlan";

/** 표의 한 줄 = 항목 하나. 금액은 원 단위(만원 × 10,000) */
export type InteriorPlanTableRow = {
  /** 대표 견적의 업체. 견적 0개면 "" */
  vendor: string;
  /** `[욕실1]`처럼 대괄호 포함. 공간이 없으면 `[공간 없음]` */
  spaceLabel: string;
  /** 대표 견적의 메모. 없으면 "" (가리기 때 이 부분만 가린다) */
  quoteMemo: string;
  /** 대표 견적 금액(원). 견적 0개면 undefined */
  quoteWon: number | undefined;
  /** 확정 견적 금액(원). 미확정이면 undefined */
  confirmedWon: number | undefined;
  /** 비고 전체. 없으면 "" (가리기 때 통째로 가린다) */
  note: string;
};

export type InteriorPlanTable = {
  /** 구분(공종) 묶음. `tradeGroups` 순서, 항목 0개면 [] */
  groups: { trade: string; rows: InteriorPlanTableRow[] }[];
  /** "계"(원). 합이 0이어도 0 */
  totals: { quote: number; confirmed: number };
};

function toWon(manwon: number): number {
  return manwon * WON_PER_MANWON;
}

/** 대표 견적 = 확정 견적, 없으면 가장 싼 견적(같으면 먼저 적은 것). 견적 0개면 null */
function representativeQuoteOf({ item, confirmedAmount }: InteriorItemLine): InteriorQuote | null {
  const quotes = item.quotes ?? [];
  if (confirmedAmount !== null) {
    return quotes.find((quote) => quote.id === item.confirmedQuoteId) ?? null;
  }
  return quotes.reduce<InteriorQuote | null>(
    (lowest, quote) => (lowest === null || quote.amount < lowest.amount ? quote : lowest),
    null,
  );
}

/** 비고: ① 항목 메모 ② 미확정(견적 n개 중 최저) ③ 예산 대비 초과 ④ (견적 0개면) 예산. 있는 조각만 잇는다 */
function noteOf({ item, confirmedAmount, overBudget }: InteriorItemLine): string {
  const quoteCount = (item.quotes ?? []).length;
  const pieces: string[] = [];
  if (item.memo !== undefined && item.memo !== "") pieces.push(item.memo);
  if (confirmedAmount === null && quoteCount > 0) {
    pieces.push(INTERIOR_PLAN_TABLE_NOTES.unconfirmed);
    if (quoteCount > 1) pieces.push(INTERIOR_PLAN_TABLE_NOTES.lowestOf(quoteCount));
  }
  if (overBudget !== null) {
    pieces.push(INTERIOR_PLAN_TABLE_NOTES.overBudget(formatThousands(toWon(overBudget))));
  }
  if (quoteCount === 0 && item.budget !== undefined) {
    pieces.push(INTERIOR_PLAN_TABLE_NOTES.budget(formatThousands(toWon(item.budget))));
  }
  return pieces.join(INTERIOR_PLAN_TABLE_SEPARATOR);
}

function toRow(line: InteriorItemLine): InteriorPlanTableRow {
  const quote = representativeQuoteOf(line);
  return {
    vendor: quote?.vendor ?? "",
    spaceLabel: `[${line.spaceName ?? INTERIOR_NO_SPACE_LABEL}]`,
    quoteMemo: quote?.memo ?? "",
    quoteWon: quote === null ? undefined : toWon(quote.amount),
    confirmedWon: line.confirmedAmount === null ? undefined : toWon(line.confirmedAmount),
    note: noteOf(line),
  };
}

function sumWon(values: (number | undefined)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/**
 * 공종별 묶음(`summarizeInteriorPlan(plan, now).tradeGroups`) → 계획 표(스펙 "줄 만들기"). 항목 하나가 한 줄이고,
 * 원 변환·대표 견적·비고를 여기서만 만든다. 화면·CSV·인쇄가 같은 결과를 쓴다. 날짜에 의존하지 않는다.
 */
export function buildInteriorPlanTable(tradeGroups: InteriorItemGroup[]): InteriorPlanTable {
  const groups = tradeGroups.map((group) => ({
    trade: group.label,
    rows: group.lines.map(toRow),
  }));
  const rows = groups.flatMap((group) => group.rows);
  return {
    groups,
    totals: {
      quote: sumWon(rows.map((row) => row.quoteWon)),
      confirmed: sumWon(rows.map((row) => row.confirmedWon)),
    },
  };
}
