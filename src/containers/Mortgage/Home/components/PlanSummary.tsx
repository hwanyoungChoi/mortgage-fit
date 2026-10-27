import MaskedValue from "@/components/MaskedValue";
import { formatManwon } from "@/lib/utils/amount";

import styles from "./PlanSummary.module.css";

import type { InteriorPlanSummary } from "@/lib/utils/summarizeInteriorPlan";

type PlanSummaryProps = {
  summary: InteriorPlanSummary;
  isMasked: boolean;
  /** 총 예산이 없을 때 남은 예산 자리의 [총 예산 입력] */
  onBudgetEdit: (button: HTMLButtonElement) => void;
};

/**
 * 요약 줄(AC-2). 매일 보는 두 값(남은 예산·앞으로 낼 돈)을 크게, 나머지 넷(총 예산·예상 총액·확정·지급함)은 작게 둔다.
 * 남은 예산이 음수면 "예산 초과 n만원", 총 예산이 없으면 그 자리에 [총 예산 입력]이다.
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
          <span className={styles.headlineLabel}>앞으로 낼 돈</span>
          <strong className={styles.figure}>{money(summary.upcomingTotal)}</strong>
        </div>
      </div>
      <dl className={styles.details}>
        <div className={styles.detail}>
          <dt>총 예산</dt>
          <dd>{summary.budget === null ? "—" : money(summary.budget)}</dd>
        </div>
        <div className={styles.detail}>
          <dt>예상 총액</dt>
          <dd>{money(summary.expectedTotal)}</dd>
        </div>
        <div className={styles.detail}>
          <dt>확정</dt>
          <dd>{money(summary.confirmedTotal)}</dd>
        </div>
        <div className={styles.detail}>
          <dt>지급함</dt>
          <dd>{money(summary.paidTotal)}</dd>
        </div>
      </dl>
    </section>
  );
}

export default PlanSummary;
