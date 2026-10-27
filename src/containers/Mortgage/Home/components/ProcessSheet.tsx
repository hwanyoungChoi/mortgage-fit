import Sheet from "@/components/Sheet";
import {
  INTERIOR_PROCESS_BASE_DATE,
  INTERIOR_PROCESS_SOURCES,
  INTERIOR_TRADES,
} from "@/lib/constants/interiorPlan";

import styles from "./ProcessSheet.module.css";

type ProcessSheetProps = {
  onClose: () => void;
};

/** [공정 순서] 안내(AC-3). 단계는 공종 프리셋과 같은 상수이고, 자료마다 다른 앞뒤는 업체와 맞추라고 알린다. */
function ProcessSheet({ onClose }: ProcessSheetProps) {
  return (
    <Sheet title="공정 순서" onClose={onClose}>
      <ol
        className={styles.steps}
        style={{ gridTemplateRows: `repeat(${Math.ceil(INTERIOR_TRADES.length / 2)}, auto)` }}
      >
        {INTERIOR_TRADES.map((trade, index) => (
          <li key={trade} className={styles.step}>
            <span className={styles.stepNumber} aria-hidden="true">
              {index + 1}
            </span>
            {trade}
          </li>
        ))}
      </ol>
      <p className={styles.caution}>
        타일과 도장, 도배와 바닥의 앞뒤는 자료마다 다릅니다. 업체와 일정을 맞추세요
      </p>
      <div className={styles.sources}>
        <h3 className={styles.sourcesTitle}>출처</h3>
        <ul className={styles.sourceList}>
          {INTERIOR_PROCESS_SOURCES.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
            </li>
          ))}
        </ul>
        <p className={styles.baseDate}>기준일 {INTERIOR_PROCESS_BASE_DATE}</p>
      </div>
    </Sheet>
  );
}

export default ProcessSheet;
