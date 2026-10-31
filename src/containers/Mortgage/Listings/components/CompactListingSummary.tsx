import ChevronDown from "lucide-react/icons/chevron-down";

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
 * 펼치면 이름·금액은 펼친 카드의 머리와 답이 맡으므로 화면에서 빼고 보조기기에만 읽힌다. 예산 초과 배지는 두지 않는다(펼친 카드에 있다). 상태 칩은 줄 버튼 밖 형제라 쓰는 쪽이 앞에 둔다.
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
      <span className={isExpanded ? styles.hiddenText : styles.name}>{listing.name}</span>
      <span className={isExpanded ? styles.hiddenText : styles.amount}>
        <MaskedValue isMasked={isMasked}>{formatManwonOrDash(ownFunds)}</MaskedValue>
      </span>
      <ChevronDown
        className={isExpanded ? styles.chevronOpen : styles.chevron}
        size={18}
        aria-hidden="true"
      />
    </span>
  );
}

export default CompactListingSummary;
