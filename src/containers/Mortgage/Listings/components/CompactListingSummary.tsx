import MaskedValue from "@/components/MaskedValue";
import { formatManwonOrDash } from "@/lib/utils/amount";
import { calculateLoan } from "@/lib/utils/calculateLoan";

import styles from "./CompactListingSummary.module.css";

import type { Listing } from "@/lib/types/listing";
import type { Regulations } from "@/lib/types/regulation";

type CompactListingSummaryProps = {
  listing: Listing;
  regulations: Regulations;
  isExpanded: boolean;
  /** 가리기 모드: 자기자금을 가린다 */
  isMasked: boolean;
};

/**
 * 간단히 보기 한 줄의 내용: 이름과 필요한 자기자금, 펼침 표시. 줄 버튼과 끄는 동안 뜬 줄이 같이 쓴다.
 * 예산 초과 배지는 두지 않는다(펼친 카드에 있다). 상태 칩은 줄 버튼 밖 형제라 쓰는 쪽이 앞에 둔다.
 */
function CompactListingSummary({
  listing,
  regulations,
  isExpanded,
  isMasked,
}: CompactListingSummaryProps) {
  const { ownFunds } = calculateLoan(listing, regulations);

  return (
    <span className={styles.summary}>
      <span className={styles.name}>{listing.name}</span>
      <span className={styles.amount}>
        <MaskedValue isMasked={isMasked}>{formatManwonOrDash(ownFunds)}</MaskedValue>
      </span>
      <span className={isExpanded ? styles.chevronOpen : styles.chevron} aria-hidden="true">
        ▾
      </span>
    </span>
  );
}

export default CompactListingSummary;
