import { WON_PER_MANWON } from "@/lib/constants/interiorPlanTable";

import { formatThousands } from "./amount";
import { rowNoteOf } from "./interiorPlanRows";

import type { InteriorPlanRow, InteriorPlanRows } from "./interiorPlanRows";

/** 표의 한 줄 = 목록의 한 줄(항목, 견적 한 쌍). 금액은 원 단위(만원 × 10,000) */
export type InteriorPlanTableRow = {
  /** 견적의 업체. 견적 없는 줄은 "" */
  vendor: string;
  /** 세부내용 = 견적 메모. 없으면 "" (가리기 때 가린다) */
  detail: string;
  /** 견적 금액(원). 견적 없는 줄은 undefined */
  quoteWon: number | undefined;
  /** 확정한 줄의 견적 금액(원). 미확정이면 undefined */
  confirmedWon: number | undefined;
  /** 비고 = 항목 메모 · (견적 없는 줄이면) 예산. 없으면 "" (가리기 때 통째로 가린다) */
  note: string;
};

export type InteriorPlanTable = {
  /** 구분 묶음. 목록과 같은 순서, 줄 0개면 [] */
  groups: { trade: string; rows: InteriorPlanTableRow[] }[];
  /** "계"(원) = 지출 예정. 견적을 다 더한 값은 뜻이 없어 두지 않는다(U6). 0이어도 0 */
  confirmedTotal: number;
};

function toWon(manwon: number): number {
  return manwon * WON_PER_MANWON;
}

const formatWon = (manwon: number) => `${formatThousands(toWon(manwon))}원`;

function toRow(row: InteriorPlanRow): InteriorPlanTableRow {
  const { quote } = row;
  return {
    vendor: quote?.vendor ?? "",
    detail: quote?.memo ?? "",
    quoteWon: quote === null ? undefined : toWon(quote.amount),
    confirmedWon: quote !== null && row.isConfirmed ? toWon(quote.amount) : undefined,
    note: rowNoteOf(row, formatWon),
  };
}

/**
 * 공정별 줄(`buildInteriorPlanRows`) → 계획 표. 줄·순서는 목록 그대로이고 원 변환·비고를 여기서만 만든다.
 * 화면·CSV·인쇄가 같은 결과를 쓴다. 날짜에 의존하지 않는다.
 */
export function buildInteriorPlanTable({
  groups,
  plannedTotal,
}: InteriorPlanRows): InteriorPlanTable {
  return {
    groups: groups.map((group) => ({ trade: group.trade, rows: group.rows.map(toRow) })),
    confirmedTotal: toWon(plannedTotal),
  };
}
