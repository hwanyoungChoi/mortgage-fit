import { INTERIOR_PLAN_TBD_LABEL } from "@/lib/constants/interiorPlanTable";

import { rowNoteOf, tbdExclusionNote } from "./interiorPlanRows";

import type { InteriorPlanRow, InteriorPlanRows } from "./interiorPlanRows";

/** 금액 칸 값: 원 단위 금액 / "tbd" 금액 미정(견적은 있고 금액 키가 없음, ADR-033) / undefined 빈칸 */
export type InteriorPlanTableAmount = number | "tbd" | undefined;

/** 표의 한 줄 = 목록의 한 줄(항목, 견적 한 쌍). 금액은 원 단위(`InteriorPlanRow.quoteWon`) */
export type InteriorPlanTableRow = {
  /** 견적의 업체. 견적 없는 줄은 "" */
  vendor: string;
  /** 세부내용 = 견적 메모. 없으면 "" */
  detail: string;
  /** 견적 금액(원). 금액 미정이면 "tbd", 견적 없는 줄은 undefined */
  quoteWon: InteriorPlanTableAmount;
  /** 확정한 줄의 견적 금액(원, 미정이면 "tbd"). 미확정이면 undefined */
  confirmedWon: InteriorPlanTableAmount;
  /** 비고 = 항목 메모 · (견적 없는 줄이면) 예산. 없으면 "" */
  note: string;
};

export type InteriorPlanTable = {
  /** 구분 묶음. 목록과 같은 순서, 줄 0개면 [] */
  groups: { trade: string; rows: InteriorPlanTableRow[] }[];
  /** "계"(원) = 지출 예정. 견적을 다 더한 값은 뜻이 없어 두지 않는다(U6). 0이어도 0 */
  confirmedTotal: number;
  /** "계" 줄 비고 "금액 미정 n건 제외". 미정 0건이면 "" */
  totalNote: string;
};

/** 줄 → 금액 칸. 견적 없음 / 미정 / 금액을 여기서만 나눈다 */
function amountOf(row: InteriorPlanRow): InteriorPlanTableAmount {
  if (row.quote === null) return undefined;
  return row.quoteWon ?? "tbd";
}

function toRow(row: InteriorPlanRow): InteriorPlanTableRow {
  const { quote } = row;
  const quoteWon = amountOf(row);
  return {
    vendor: quote?.vendor ?? "",
    detail: quote?.memo ?? "",
    quoteWon,
    confirmedWon: row.isConfirmed ? quoteWon : undefined,
    note: rowNoteOf(row),
  };
}

/** 금액 칸의 글자(화면·인쇄·CSV 공통). 원 금액은 부르는 쪽이 정한 형식(화면은 천 단위 쉼표, CSV는 숫자만), 빈칸은 "" */
export function tableAmountText(
  amount: InteriorPlanTableAmount,
  formatAmount: (won: number) => string,
): string {
  if (amount === undefined) return "";
  return amount === "tbd" ? INTERIOR_PLAN_TBD_LABEL : formatAmount(amount);
}

/**
 * 공정별 줄(`buildInteriorPlanRows`) → 계획 표. 줄·순서·원 금액은 목록 그대로이고 금액 칸·비고를 여기서만 만든다.
 * 화면·CSV·인쇄가 같은 결과를 쓴다. 날짜에 의존하지 않는다.
 */
export function buildInteriorPlanTable({
  groups,
  plannedTotalWon,
  tbdCount,
}: InteriorPlanRows): InteriorPlanTable {
  return {
    groups: groups.map((group) => ({ trade: group.trade, rows: group.rows.map(toRow) })),
    confirmedTotal: plannedTotalWon,
    totalNote: tbdExclusionNote(tbdCount),
  };
}
