import {
  INTERIOR_PLAN_EXPORT_NOTICE,
  INTERIOR_PLAN_TABLE_EMPTY_MESSAGE,
  INTERIOR_PLAN_TABLE_SCROLL_LABEL,
} from "@/lib/constants/interiorPlanTable";
import { buildInteriorPlanTable } from "@/lib/utils/buildInteriorPlanTable";
import { downloadTextFile } from "@/lib/utils/downloadTextFile";
import {
  interiorPlanExportFileName,
  interiorPlanTableHeading,
} from "@/lib/utils/interiorPlanExportText";
import { interiorPlanTableToCsvRows } from "@/lib/utils/interiorPlanTableToCsvRows";
import { toCsv } from "@/lib/utils/toCsv";

import EmptyItems from "./EmptyItems";
import PlanTable from "./PlanTable";
import styles from "./PlanTable.module.css";

import type { InteriorPlanRows, InteriorPlanSummary } from "@/lib/utils/interiorPlanRows";

type PlanTableViewProps = {
  planName: string;
  /** 목록과 같은 줄 묶음 */
  rows: InteriorPlanRows;
  summary: InteriorPlanSummary;
  /** 렌더의 `now`에서 온 기기 날짜. 표 머리와 파일 이름이 같이 쓴다(A14) */
  today: string;
};

/**
 * 표 보기(`?view=table`, ADR-030): [CSV 내려받기][인쇄·PDF] → 안내 한 줄(줄이 있을 때, U21) → 표 머리와 표(인쇄 영역).
 * 표·파일은 매 렌더의 값으로 만들어 폴링 뒤에도 화면에 보이는 표와 받는 파일이 같다. 저장소·서버에는 아무것도 쓰지 않는다.
 * 인쇄는 `data-print-area` 하나만 보이게 하는 전역 규칙(`index.css`)이 처리한다.
 */
function PlanTableView({ planName, rows, summary, today }: PlanTableViewProps) {
  const table = buildInteriorPlanTable(rows);
  const heading = interiorPlanTableHeading(planName, summary, today);
  // 표·안내·내보내기 판단은 여기 한 곳. 버튼 비활성과 두 핸들러의 첫 줄이 같은 값을 쓴다(줄 0개면 내보낼 것이 없다).
  const hasItems = table.groups.length > 0;

  const handleDownload = () => {
    if (!hasItems) return;
    downloadTextFile(
      interiorPlanExportFileName(planName, today),
      toCsv(interiorPlanTableToCsvRows(table)),
    );
  };

  const handlePrint = () => {
    if (!hasItems) return;
    window.print();
  };

  return (
    <>
      <div className={styles.exportRow}>
        <div className={styles.exportButtons}>
          <button
            type="button"
            className={styles.exportButton}
            disabled={!hasItems}
            onClick={handleDownload}
          >
            CSV 내려받기
          </button>
          <button
            type="button"
            className={styles.exportButton}
            disabled={!hasItems}
            onClick={handlePrint}
          >
            인쇄·PDF
          </button>
        </div>
        {hasItems && <p className={styles.exportNotice}>{INTERIOR_PLAN_EXPORT_NOTICE}</p>}
      </div>
      {hasItems ? (
        <div className={styles.printArea} data-print-area>
          <div className={styles.heading}>
            <h2 className={styles.headingTitle}>{heading.title}</h2>
            <p className={styles.headingLine}>{heading.line}</p>
          </div>
          {/* 6열이 찌그러지지 않게 칸 안에서 가로로 스크롤한다. 키보드로도 닿게 포커스를 받는다. */}
          <div
            className={styles.scroll}
            role="region"
            aria-label={INTERIOR_PLAN_TABLE_SCROLL_LABEL}
            tabIndex={0}
          >
            <PlanTable table={table} title={heading.title} />
          </div>
        </div>
      ) : (
        <EmptyItems message={INTERIOR_PLAN_TABLE_EMPTY_MESSAGE} />
      )}
    </>
  );
}

export default PlanTableView;
