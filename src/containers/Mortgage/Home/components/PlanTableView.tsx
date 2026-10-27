import { Fragment } from "react";

import MaskedValue from "@/components/MaskedValue";
import {
  INTERIOR_PLAN_EXPORT_NOTICES,
  INTERIOR_PLAN_TABLE_EMPTY_MESSAGE,
  INTERIOR_PLAN_TABLE_SCROLL_LABEL,
  INTERIOR_PLAN_TABLE_SEPARATOR,
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

import type { InteriorPlanTableHeading } from "@/lib/utils/interiorPlanExportText";
import type { InteriorPlanRows, InteriorPlanSummary } from "@/lib/utils/interiorPlanRows";

type PlanTableViewProps = {
  planName: string;
  /** 목록과 같은 줄 묶음 */
  rows: InteriorPlanRows;
  summary: InteriorPlanSummary;
  /** 렌더의 `now`에서 온 기기 날짜. 표 머리와 파일 이름이 같이 쓴다(A14) */
  today: string;
  isPrivacyMode: boolean;
};

/** 버튼 줄 아래 안내 한 줄. 줄 0개면 없음(가리기보다 먼저) → 가리기 → 고정 안내(U18·U21) */
function exportNoticeOf(hasItems: boolean, isPrivacyMode: boolean): string | null {
  if (!hasItems) return null;
  return isPrivacyMode
    ? INTERIOR_PLAN_EXPORT_NOTICES.privacyMode
    : INTERIOR_PLAN_EXPORT_NOTICES.browser;
}

/** 표 머리 둘째 줄. 가리기 때는 금액 조각(총 예산·지출 예정·남은 예산/예산 초과)만 가린다(기준일은 보인다) */
function HeadingLine({
  heading,
  isMasked,
}: {
  heading: InteriorPlanTableHeading;
  isMasked: boolean;
}) {
  if (!isMasked) return heading.line;
  const moneyPieces = [heading.budget, heading.plannedTotal, heading.remaining].filter(
    (piece): piece is string => piece !== undefined,
  );
  return (
    <>
      {heading.basis}
      {moneyPieces.map((piece) => (
        <Fragment key={piece}>
          {INTERIOR_PLAN_TABLE_SEPARATOR}
          <MaskedValue isMasked>{piece}</MaskedValue>
        </Fragment>
      ))}
    </>
  );
}

/**
 * 표 보기(`?view=table`, ADR-030): [CSV 내려받기][인쇄·PDF] → 안내 한 줄 → 표 머리와 표(인쇄 영역).
 * 표·파일은 매 렌더의 값으로 만들어 폴링 뒤에도 화면에 보이는 표와 받는 파일이 같다. 저장소·서버에는 아무것도 쓰지 않는다.
 * 인쇄는 `data-print-area` 하나만 보이게 하는 전역 규칙(`index.css`)이 처리한다.
 */
function PlanTableView({ planName, rows, summary, today, isPrivacyMode }: PlanTableViewProps) {
  const table = buildInteriorPlanTable(rows);
  const heading = interiorPlanTableHeading(planName, summary, today);
  const hasItems = table.groups.length > 0;
  // 내보내기 판단은 여기 한 곳. 버튼 비활성과 두 핸들러의 첫 줄이 같은 값을 쓴다(가린 값이 파일·인쇄로 나가지 않게).
  const canExport = !isPrivacyMode && hasItems;
  const exportNotice = exportNoticeOf(hasItems, isPrivacyMode);

  const handleDownload = () => {
    if (!canExport) return;
    downloadTextFile(
      interiorPlanExportFileName(planName, today),
      toCsv(interiorPlanTableToCsvRows(table)),
    );
  };

  const handlePrint = () => {
    if (!canExport) return;
    window.print();
  };

  return (
    <>
      <div className={styles.exportRow}>
        <div className={styles.exportButtons}>
          <button
            type="button"
            className={styles.exportButton}
            disabled={!canExport}
            onClick={handleDownload}
          >
            CSV 내려받기
          </button>
          <button
            type="button"
            className={styles.exportButton}
            disabled={!canExport}
            onClick={handlePrint}
          >
            인쇄·PDF
          </button>
        </div>
        {exportNotice !== null && <p className={styles.exportNotice}>{exportNotice}</p>}
      </div>
      {hasItems ? (
        <div className={styles.printArea} data-print-area>
          <div className={styles.heading}>
            <h2 className={styles.headingTitle}>{heading.title}</h2>
            <p className={styles.headingLine}>
              <HeadingLine heading={heading} isMasked={isPrivacyMode} />
            </p>
          </div>
          {/* 6열이 찌그러지지 않게 칸 안에서 가로로 스크롤한다. 키보드로도 닿게 포커스를 받는다. */}
          <div
            className={styles.scroll}
            role="region"
            aria-label={INTERIOR_PLAN_TABLE_SCROLL_LABEL}
            tabIndex={0}
          >
            <PlanTable table={table} title={heading.title} isMasked={isPrivacyMode} />
          </div>
        </div>
      ) : (
        <EmptyItems message={INTERIOR_PLAN_TABLE_EMPTY_MESSAGE} />
      )}
    </>
  );
}

export default PlanTableView;
