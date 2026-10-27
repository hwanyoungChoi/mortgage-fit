import MaskedValue from "@/components/MaskedValue";
import { formatManwon } from "@/lib/utils/amount";
import { NO_SPACE_GROUP_ID } from "@/lib/utils/summarizeInteriorPlan";

import styles from "./ItemGroups.module.css";
import ItemRow from "./ItemRow";

import type { ListView } from "@/lib/types/route";
import type { InteriorItemGroup } from "@/lib/utils/summarizeInteriorPlan";

type ItemGroupsProps = {
  groups: InteriorItemGroup[];
  view: ListView;
  isMasked: boolean;
  onItemOpen: (itemId: string, button: HTMLButtonElement) => void;
  /** 공간별 보기에서 묶음 머리의 [추가]: 그 공간을 채운 새 항목 시트 */
  onAddToSpace: (spaceId: string, button: HTMLButtonElement) => void;
  canAddItem: boolean;
};

/** 공간별(플랜 공간 순서)·공종별(공정 순서) 묶음과 합계(AC-3). 항목 없는 묶음은 요약이 이미 뺐다. */
function ItemGroups({
  groups,
  view,
  isMasked,
  onItemOpen,
  onAddToSpace,
  canAddItem,
}: ItemGroupsProps) {
  return (
    <div className={styles.groups}>
      {groups.map((group) => {
        const canAddHere = view === "space" && group.id !== NO_SPACE_GROUP_ID;
        return (
          <section key={group.id} className={styles.group} aria-label={group.label}>
            <div className={styles.groupHeader}>
              <h3 className={styles.groupTitle}>
                {group.label}
                <span className={styles.groupTotal}>
                  <MaskedValue isMasked={isMasked}>{formatManwon(group.total)}</MaskedValue>
                </span>
              </h3>
              {canAddHere && (
                <button
                  type="button"
                  className={styles.groupAddButton}
                  aria-label={`${group.label}에 항목 추가`}
                  aria-haspopup="dialog"
                  disabled={!canAddItem}
                  onClick={(event) => onAddToSpace(group.id, event.currentTarget)}
                >
                  추가
                </button>
              )}
            </div>
            <ul className={styles.rows}>
              {group.lines.map((line) => (
                <ItemRow
                  key={line.item.id}
                  line={line}
                  view={view}
                  isMasked={isMasked}
                  onOpen={(button) => onItemOpen(line.item.id, button)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default ItemGroups;
