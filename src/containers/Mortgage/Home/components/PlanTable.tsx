import { Fragment, type ReactNode } from "react";

import {
  INTERIOR_PLAN_TABLE_COLUMN_LABELS,
  INTERIOR_PLAN_TABLE_TOTAL_LABEL,
} from "@/lib/constants/interiorPlanTable";
import { formatThousands } from "@/lib/utils/amount";
import { tableAmountText, tableVendorText } from "@/lib/utils/buildInteriorPlanTable";

import styles from "./PlanTable.module.css";

import type { InteriorPlanTableColumn } from "@/lib/constants/interiorPlanTable";
import type {
  InteriorPlanTable,
  InteriorPlanTableAmount,
  InteriorPlanTableRow,
} from "@/lib/utils/buildInteriorPlanTable";

/** 열마다 칸 모양(금액 열만 오른쪽 정렬·고정폭 숫자) */
const COLUMN_CLASS_NAMES: Record<InteriorPlanTableColumn, string> = {
  trade: styles.tradeCell,
  vendor: styles.vendorCell,
  detail: styles.detailCell,
  quote: styles.amountCell,
  confirmed: styles.amountCell,
  done: styles.amountCell,
  note: styles.noteCell,
};

/** 원 단위 금액(천 단위 쉼표) 또는 "미정". 없으면 빈칸 */
function AmountCell({ won }: { won: InteriorPlanTableAmount }) {
  return <td className={styles.amountCell}>{tableAmountText(won, formatThousands)}</td>;
}

type PlanTableRowProps = {
  row: InteriorPlanTableRow;
  columns: readonly InteriorPlanTableColumn[];
  /** 구분 묶음의 첫 줄에만 구분 칸을 두고 묶음 줄 수만큼 병합한다 */
  trade: { name: string; rowSpan: number } | null;
};

/** 줄 하나 */
function PlanTableRow({ row, columns, trade }: PlanTableRowProps) {
  const cells: Record<Exclude<InteriorPlanTableColumn, "trade">, ReactNode> = {
    vendor: <td className={styles.vendorCell}>{tableVendorText(row.vendor)}</td>,
    detail: <td className={styles.detailCell}>{row.detail}</td>,
    quote: <AmountCell won={row.quoteWon} />,
    confirmed: <AmountCell won={row.confirmedWon} />,
    done: <AmountCell won={row.doneWon} />,
    note: <td className={styles.noteCell}>{row.note}</td>,
  };
  return (
    <tr>
      {columns.map((column) =>
        column === "trade" ? (
          trade !== null && (
            <th key={column} scope="rowgroup" rowSpan={trade.rowSpan} className={styles.tradeCell}>
              {trade.name}
            </th>
          )
        ) : (
          <Fragment key={column}>{cells[column]}</Fragment>
        ),
      )}
    </tr>
  );
}

type PlanTableProps = {
  table: InteriorPlanTable;
  /** 표의 접근 가능한 이름(표 머리 제목) */
  title: string;
};

/**
 * 계획 표(읽기 전용): 열 제목 → 구분(공정)마다 `<tbody>` 하나 → `<tfoot>` "계"(확정·완료 칸만, U6).
 * 금액은 이미 원 단위라 천 단위 쉼표만 붙이고 다시 곱하지 않는다. 빈칸은 비워 둔다.
 */
function PlanTable({ table, title }: PlanTableProps) {
  const totalCells: Record<InteriorPlanTableColumn, ReactNode> = {
    trade: (
      <th scope="row" className={styles.tradeCell}>
        {INTERIOR_PLAN_TABLE_TOTAL_LABEL}
      </th>
    ),
    vendor: <td className={styles.vendorCell} />,
    detail: <td className={styles.detailCell} />,
    quote: <td className={styles.amountCell} />,
    confirmed: <AmountCell won={table.confirmedTotal} />,
    done: <AmountCell won={table.doneTotal} />,
    note: <td className={styles.noteCell}>{table.totalNote}</td>,
  };
  return (
    <table className={styles.table} aria-label={title}>
      <thead>
        <tr>
          {table.columns.map((column) => (
            <th key={column} scope="col" className={COLUMN_CLASS_NAMES[column]}>
              {INTERIOR_PLAN_TABLE_COLUMN_LABELS[column]}
            </th>
          ))}
        </tr>
      </thead>
      {table.groups.map((group) => (
        <tbody key={group.trade} className={styles.group}>
          {group.rows.map((row, index) => (
            // 줄은 목록의 줄 순서 그대로이고 읽기 전용이라 순서를 key로 쓴다
            <PlanTableRow
              key={index}
              row={row}
              columns={table.columns}
              trade={index === 0 ? { name: group.trade, rowSpan: group.rows.length } : null}
            />
          ))}
        </tbody>
      ))}
      <tfoot>
        <tr>
          {table.columns.map((column) => (
            <Fragment key={column}>{totalCells[column]}</Fragment>
          ))}
        </tr>
      </tfoot>
    </table>
  );
}

export default PlanTable;
