import {
  INTERIOR_PLAN_TABLE_COLUMN_LABELS,
  INTERIOR_PLAN_TABLE_COLUMNS,
  INTERIOR_PLAN_TABLE_TOTAL_LABEL,
} from "@/lib/constants/interiorPlanTable";

import { tableAmountText } from "./buildInteriorPlanTable";

import type { InteriorPlanTable } from "./buildInteriorPlanTable";

/**
 * 계획 표 → CSV 문자열 행(U16·U17): 열 제목 → 데이터 줄(구분을 매 줄 반복, 병합 없음) → 계 줄.
 * 표 머리(이름·날짜·예산)는 넣지 않는다. 계는 확정 칸만이고(견적 칸 비움, U6) 수식이 아니라 값이며 0이면 "0"이다.
 * 금액 칸은 쉼표·"원" 없는 정수, 금액 미정은 "미정"(엑셀 SUM이 건너뛴다), 빈칸은 빈 필드다.
 */
export function interiorPlanTableToCsvRows(table: InteriorPlanTable): string[][] {
  const header = INTERIOR_PLAN_TABLE_COLUMNS.map(
    (column) => INTERIOR_PLAN_TABLE_COLUMN_LABELS[column],
  );
  const dataRows = table.groups.flatMap((group) =>
    group.rows.map((row) => [
      group.trade,
      row.vendor,
      row.detail,
      tableAmountText(row.quoteWon, String),
      tableAmountText(row.confirmedWon, String),
      row.note,
    ]),
  );
  const totalRow = [INTERIOR_PLAN_TABLE_TOTAL_LABEL, "", "", "", String(table.confirmedTotal), ""];
  return [header, ...dataRows, totalRow];
}
