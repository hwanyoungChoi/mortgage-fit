import { formatWon } from "@/lib/utils/amount";
import { tbdExclusionNote } from "@/lib/utils/interiorPlanRows";

import styles from "./PlanSummary.module.css";

import type { InteriorPlanSummary } from "@/lib/utils/interiorPlanRows";

type PlanSummaryProps = {
  summary: InteriorPlanSummary;
  /** 총 예산이 없을 때 남은 예산 자리의 [총 예산 입력] */
  onBudgetEdit: (button: HTMLButtonElement) => void;
};

/**
 * 요약 줄(U6). 남은 예산(코발트)을 화면에서 가장 크게 두고, 그 아래 예산 막대와 지출 예정·지출 완료·총 예산을 둔다.
 * 지출 예정 = 확정이고 완료가 아닌 줄의 견적 합, 지출 완료 = [완료] 줄의 견적 합, 남은 예산 = 총 예산 − 둘.
 * 지출 완료는 [완료] 줄이 있을 때만 보인다.
 * 금액은 원("1,234,500원"). 남은 예산이 음수면 "예산 초과 n원"(0은 "0원"), 총 예산이 없으면 그 자리에 [총 예산 입력]이다.
 * 확정한 미정 줄이 있으면 지출 예정 아래 "금액 미정 n건 제외"다.
 */
function PlanSummary({ summary, onBudgetEdit }: PlanSummaryProps) {
  const tbdNote = tbdExclusionNote(summary.tbdCount);

  const renderRemaining = () => {
    if (summary.remainingWon === null) {
      return (
        <button
          type="button"
          className={styles.budgetButton}
          aria-haspopup="dialog"
          onClick={(event) => onBudgetEdit(event.currentTarget)}
        >
          총 예산 입력
        </button>
      );
    }
    if (summary.remainingWon < 0) {
      return (
        <strong className={styles.overFigure}>예산 초과 {formatWon(-summary.remainingWon)}</strong>
      );
    }
    return <strong className={styles.remainingFigure}>{formatWon(summary.remainingWon)}</strong>;
  };

  const hasBudget = summary.budgetWon !== null && summary.budgetWon > 0;
  const budget = summary.budgetWon ?? 0;
  const isOver = summary.remainingWon !== null && summary.remainingWon < 0;
  const donePercent = hasBudget ? Math.min(summary.doneTotalWon / budget, 1) * 100 : 0;
  const plannedPercent = hasBudget
    ? Math.min(summary.plannedTotalWon / budget, 1 - donePercent / 100) * 100
    : 0;

  return (
    <section className={styles.summary} aria-label="요약">
      <div className={styles.headlineItem}>
        <span className={styles.headlineLabel}>남은 예산</span>
        {renderRemaining()}
      </div>
      {hasBudget && (
        <div className={styles.meter} aria-hidden="true">
          {donePercent > 0 && (
            <span className={styles.meterDone} style={{ width: `${donePercent}%` }} />
          )}
          {plannedPercent > 0 && (
            <span
              className={isOver ? styles.meterOver : styles.meterPlanned}
              style={{ width: `${plannedPercent}%` }}
            />
          )}
        </div>
      )}
      <div className={styles.detailGroups}>
        <dl>
          <div className={styles.plannedDetail}>
            <dt>
              {hasBudget && <span className={styles.swatchPlanned} aria-hidden="true" />}
              지출 예정
            </dt>
            <dd>{formatWon(summary.plannedTotalWon)}</dd>
          </div>
        </dl>
        {tbdNote !== "" && <p className={styles.tbdNote}>{tbdNote}</p>}
        <dl className={styles.details}>
          <div className={styles.detail}>
            <dt>총 예산</dt>
            <dd>{summary.budgetWon === null ? "—" : formatWon(summary.budgetWon)}</dd>
          </div>
          {summary.doneCount > 0 && (
            <div className={styles.detail}>
              <dt>
                {hasBudget && <span className={styles.swatchDone} aria-hidden="true" />}
                지출 완료
              </dt>
              <dd>{formatWon(summary.doneTotalWon)}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}

export default PlanSummary;
