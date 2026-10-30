import { formatWon } from "@/lib/utils/amount";
import { groupConfirmedWonOf } from "@/lib/utils/interiorPlanRows";

import styles from "./PlanLines.module.css";

import type { InteriorPlanRowGroup } from "@/lib/utils/interiorPlanRows";
import type { ReactNode } from "react";

/**
 * 묶음 머리: 왼쪽 제목(`title`, 묶음 손잡이 버튼이거나 구분 글자) + 오른쪽 끝 확정 합계.
 * 확정이고 금액이 있는 줄이 없으면 합계를 그리지 않는다. 목록 묶음과 끄는 동안 뜬 묶음이 같이 쓴다.
 */
function GroupHeader({
  group,
  title,
  as: Title = "h3",
}: {
  group: InteriorPlanRowGroup;
  title: ReactNode;
  as?: "h3" | "p";
}) {
  const confirmedWon = groupConfirmedWonOf(group);
  return (
    <div className={styles.groupHeader}>
      <Title className={styles.groupTitle}>{title}</Title>
      {confirmedWon !== null && (
        <p className={styles.groupTotal}>
          <span className={styles.screenReaderOnly}>확정 합계</span> {formatWon(confirmedWon)}
        </p>
      )}
    </div>
  );
}

export default GroupHeader;
