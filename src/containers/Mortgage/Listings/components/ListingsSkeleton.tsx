import Skeleton from "@/components/Skeleton";

import styles from "./ListingsSkeleton.module.css";

const SKELETON_ROWS = [1, 2, 3];

/**
 * 저장 목록 본문 스켈레톤: 예산 줄(라벨·금액·버튼) → 표 머리(정적 글자) → 줄 3개(이름·금액). 실제 예산 줄·표와 같은
 * 여백·줄 높이라 드러낼 때 첫 줄 자리가 움직이지 않는다.
 */
function ListingsSkeleton() {
  return (
    <>
      <div className={styles.budgetBar}>
        <Skeleton width="4em" height="1em" />
        <span className={styles.amount}>
          <Skeleton width="5em" height="1em" />
        </span>
        <Skeleton width="48px" height="36px" radius="var(--radius-small)" />
      </div>
      <div className={styles.table}>
        <div className={styles.header} aria-hidden="true">
          <span>이름</span>
          <span>필요한 자기자금</span>
        </div>
        {SKELETON_ROWS.map((row) => (
          <div key={row} className={styles.row}>
            <Skeleton width="40%" height="1em" />
            <Skeleton width="5em" height="1em" />
          </div>
        ))}
      </div>
    </>
  );
}

export default ListingsSkeleton;
