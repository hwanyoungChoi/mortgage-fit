import MaskedValue from "@/components/MaskedValue";
import { formatManwon } from "@/lib/utils/amount";

import styles from "./PlanSummary.module.css";

import type { InteriorPlanSummary } from "@/lib/utils/interiorPlanRows";

type PlanSummaryProps = {
  summary: InteriorPlanSummary;
  isMasked: boolean;
  /** 총 예산이 없을 때 남은 예산 자리의 [총 예산 입력] */
  onBudgetEdit: (button: HTMLButtonElement) => void;
};

/**
 * 요약 줄(U6). 남은 예산·지출 예정을 크게, 총 예산을 작게 둔다. 지출 예정 = 확정한 줄의 견적 합이다.
 * 남은 예산이 음수면 "예산 초과 n만원"(0은 "0만원"), 총 예산이 없으면 그 자리에 [총 예산 입력]이다.
 */
function PlanSummary({ summary, isMasked, onBudgetEdit }: PlanSummaryProps) {
  const money = (value: number) => (
    <MaskedValue isMasked={isMasked}>{formatManwon(value)}</MaskedValue>
  );

  const renderRemaining = () => {
    if (summary.remaining === null) {
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
    if (summary.remaining < 0) {
      return <strong className={styles.overFigure}>예산 초과 {money(-summary.remaining)}</strong>;
    }
    return <strong className={styles.figure}>{money(summary.remaining)}</strong>;
  };

  return (
    <section className={styles.summary} aria-label="요약">
      <div className={styles.headline}>
        <div className={styles.headlineItem}>
          <span className={styles.headlineLabel}>남은 예산</span>
          {renderRemaining()}
        </div>
        <div className={styles.headlineItem}>
          <span className={styles.headlineLabel}>지출 예정</span>
          <strong className={styles.figure}>{money(summary.plannedTotal)}</strong>
        </div>
      </div>
      <dl className={styles.details}>
        <div className={styles.detail}>
          <dt>총 예산</dt>
          <dd>{summary.budget === null ? "—" : money(summary.budget)}</dd>
        </div>
      </dl>
    </section>
  );
}

export default PlanSummary;
