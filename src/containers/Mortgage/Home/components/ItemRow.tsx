import MaskedValue from "@/components/MaskedValue";
import { INTERIOR_ITEM_STATUS_LABELS } from "@/lib/constants/interiorPlan";
import { INTERIOR_NO_SPACE_LABEL } from "@/lib/constants/interiorSpaces";
import { formatManwon } from "@/lib/utils/amount";

import styles from "./ItemGroups.module.css";

import type { HomeView } from "@/lib/types/route";
import type { InteriorItemLine } from "@/lib/utils/summarizeInteriorPlan";

type ItemRowProps = {
  line: InteriorItemLine;
  /** 공간별 보기는 공종을, 공종별 보기는 공간을 이름으로 보인다(묶음 제목이 나머지 하나다) */
  view: HomeView;
  isMasked: boolean;
  onOpen: (button: HTMLButtonElement) => void;
};

/** 항목 한 줄: 이름 · 상태 · 확정 금액(없으면 "예산 n만원") · 초과. 누르면 항목 시트를 연다. */
function ItemRow({ line, view, isMasked, onOpen }: ItemRowProps) {
  const { item, confirmedAmount, overBudget } = line;
  const spaceName = line.spaceName ?? INTERIOR_NO_SPACE_LABEL;
  const name = view === "space" ? item.trade : spaceName;
  const money = (value: number) => (
    <MaskedValue isMasked={isMasked}>{formatManwon(value)}</MaskedValue>
  );

  const renderAmount = () => {
    if (confirmedAmount !== null) return money(confirmedAmount);
    if (item.budget !== undefined) return <>예산 {money(item.budget)}</>;
    return <span className={styles.noAmount}>금액 없음</span>;
  };

  return (
    <li>
      <button
        type="button"
        className={styles.row}
        aria-haspopup="dialog"
        aria-label={`${spaceName} ${item.trade} 열기`}
        onClick={(event) => onOpen(event.currentTarget)}
      >
        <span className={styles.rowName}>
          <span className={styles.rowTitle}>{name}</span>
          <span className={styles.statusBadge}>{INTERIOR_ITEM_STATUS_LABELS[item.status]}</span>
        </span>
        <span className={styles.rowAmount}>
          <span>{renderAmount()}</span>
          {overBudget !== null && (
            <span className={styles.overBudget}>{money(overBudget)} 초과</span>
          )}
        </span>
      </button>
    </li>
  );
}

export default ItemRow;
