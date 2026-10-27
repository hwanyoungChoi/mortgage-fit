import {
  INTERIOR_PLAN_TABLE_COLUMN_LABELS,
  INTERIOR_PLAN_TABLE_COLUMNS,
  INTERIOR_PLAN_TABLE_TOTAL_LABEL,
} from "@/lib/constants/interiorPlanTable";

import type { InteriorPlanTable, InteriorPlanTableRow } from "./buildInteriorPlanTable";

/** 금액(원) → 쉼표·"원" 없는 정수. 없으면 빈 필드 */
function toWonField(won: number | undefined): string {
  return won === undefined ? "" : String(won);
}

/** 세부내용 = `[공간]`, 대표 견적 메모가 있으면 `[공간] 메모` */
function toDetailField(row: InteriorPlanTableRow): string {
  return row.quoteMemo === "" ? row.spaceLabel : `${row.spaceLabel} ${row.quoteMemo}`;
}

/**
 * 계획 표 → CSV 문자열 행(U16·U17): 열 제목 → 데이터 줄(구분을 매 줄 반복, 병합 없음) → 계 줄.
 * 표 머리(이름·날짜·예산)는 넣지 않는다. 계는 수식이 아니라 값이고 합이 0이면 "0"이다.
 */
export function interiorPlanTableToCsvRows(table: InteriorPlanTable): string[][] {
  const header = INTERIOR_PLAN_TABLE_COLUMNS.map(
    (column) => INTERIOR_PLAN_TABLE_COLUMN_LABELS[column],
  );
  const dataRows = table.groups.flatMap((group) =>
    group.rows.map((row) => [
      group.trade,
      row.vendor,
      toDetailField(row),
      toWonField(row.quoteWon),
      toWonField(row.confirmedWon),
      row.note,
    ]),
  );
  const totalRow = [
    INTERIOR_PLAN_TABLE_TOTAL_LABEL,
    "",
    "",
    String(table.totals.quote),
    String(table.totals.confirmed),
    "",
  ];
  return [header, ...dataRows, totalRow];
}
