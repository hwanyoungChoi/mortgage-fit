import Skeleton from "@/components/Skeleton";

import styles from "./HomeSkeleton.module.css";
import planScreenStyles from "./PlanScreen.module.css";

const SKELETON_GROUPS = [1, 2];
const SKELETON_ROWS = [1, 2, 3];

type HomeSkeletonProps = {
  /**
   * 드러내면 계획 머리글 + "연결된 매물" 줄이 될 자리(매물에 연결된 계획). 화면 제목 "예산"을 계획 머리글(PlanScreen)과
   * 같은 모양으로 그리고 연결된 매물 줄 자리에 막대를 둔다. 아니면 화면이 제목 "예산"을 따로 그린다
   */
  hasPlanHeader: boolean;
};

/**
 * 예산 본문 스켈레톤: (계획 머리글) → 요약 카드(라벨·큰 숫자·막대·두 줄) → 묶음 2개(제목·줄 3개). 요약 카드는 실제
 * 요약(PlanSummary)과 같은 면·여백이라 드러낼 때 요약 카드 자리가 움직이지 않는다.
 */
function HomeSkeleton({ hasPlanHeader }: HomeSkeletonProps) {
  return (
    <>
      {hasPlanHeader && (
        <header className={planScreenStyles.header}>
          <div className={planScreenStyles.titleRow}>
            <h1 className={planScreenStyles.title}>예산</h1>
          </div>
          <p className={planScreenStyles.linkedListing}>
            <Skeleton width="10em" height="1em" isOnBackground />
          </p>
        </header>
      )}
      <div className={styles.summary}>
        <div className={styles.headline}>
          <span className={styles.headlineLabel}>
            <Skeleton width="4em" height="1em" />
          </span>
          <span className={styles.figure}>
            <Skeleton width="6em" height="1em" />
          </span>
        </div>
        <Skeleton width="100%" height="8px" radius="var(--radius-pill)" />
        <span className={styles.detail}>
          <Skeleton width="60%" height="1em" />
        </span>
        <span className={styles.detail}>
          <Skeleton width="45%" height="1em" />
        </span>
      </div>
      {SKELETON_GROUPS.map((group) => (
        <div key={group} className={styles.group}>
          <span className={styles.groupTitle}>
            <Skeleton width="5em" height="1em" />
          </span>
          {SKELETON_ROWS.map((row) => (
            <div key={row} className={styles.row}>
              <Skeleton width="40%" height="1em" />
              <Skeleton width="5em" height="1em" />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export default HomeSkeleton;
