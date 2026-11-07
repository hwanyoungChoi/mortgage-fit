import { formatWon } from "@/lib/utils/amount";
import { groupConfirmedWonOf } from "@/lib/utils/interiorPlanRows";

import styles from "./PlanLines.module.css";

import type { InteriorPlanRowGroup } from "@/lib/utils/interiorPlanRows";
import type { ReactNode } from "react";

/**
 * 묶음 머리: 왼쪽 제목(`title`, 묶음 손잡이 버튼이거나 구분 글자) + 확정 합계 + 오른쪽 끝 접기 화살표(`toggle`, 목록만).
 * 확정이고 금액이 있는 줄이 없으면 합계를 그리지 않는다. 목록 묶음과 끄는 동안 뜬 묶음이 같이 쓴다.
 * 화살표 자리는 화살표가 없는 뜬 묶음에도 비워 두어 합계가 같은 자리에 있다.
 */
function GroupHeader({
  group,
  title,
  toggle,
  as: Title = "h3",
}: {
  group: InteriorPlanRowGroup;
  title: ReactNode;
  toggle?: ReactNode;
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
      {toggle}
    </div>
  );
}

export default GroupHeader;
