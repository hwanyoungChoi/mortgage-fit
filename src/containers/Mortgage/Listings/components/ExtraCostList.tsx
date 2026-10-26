import { Fragment } from "react";

import MaskedValue from "@/components/MaskedValue";
import { EXTRA_COST_CATEGORY_LABELS } from "@/lib/constants/extraCosts";
import { formatManwon } from "@/lib/utils/amount";
import { groupExtraCosts, sumExtraCosts } from "@/lib/utils/extraCosts";

import styles from "./ListingCard.module.css";

import type { ExtraCost } from "@/lib/types/extraCost";

type ExtraCostListProps = {
  /** 1줄 이상 */
  extraCosts: ExtraCost[];
  /** 가리기 모드: 항목 이름은 두고 금액만 가린다 */
  isMasked: boolean;
};

/**
 * 저장 목록 카드의 [추가 비용 내역 n개] 펼침. 분류별 소계 아래 항목을 한 줄로 잇는다. 읽기 전용이고 고치려면 [수정]이다.
 * 카드 본문 링크 밖에 둔다(눌러도 계산 화면으로 가지 않게, ADR-022 D7).
 */
function ExtraCostList({ extraCosts, isMasked }: ExtraCostListProps) {
  const groups = groupExtraCosts(extraCosts);

  return (
    <details className={styles.extraCosts}>
      <summary className={styles.extraCostsSummary}>추가 비용 내역 {extraCosts.length}개</summary>
      <dl className={styles.extraCostGroups}>
        {groups.map(({ category, items }) => (
          <div key={category} className={styles.extraCostGroup}>
            <dt className={styles.extraCostGroupTitle}>
              {EXTRA_COST_CATEGORY_LABELS[category]}{" "}
              <MaskedValue isMasked={isMasked}>{formatManwon(sumExtraCosts(items))}</MaskedValue>
            </dt>
            <dd className={styles.extraCostItems}>
              {items.map(({ label, amount }, index) => (
                <Fragment key={index}>
                  {index > 0 && " · "}
                  {label} <MaskedValue isMasked={isMasked}>{formatManwon(amount)}</MaskedValue>
                </Fragment>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export default ExtraCostList;
