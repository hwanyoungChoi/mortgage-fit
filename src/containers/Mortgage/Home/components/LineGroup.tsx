import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import LineRow from "./LineRow";
import styles from "./PlanLines.module.css";

import type { InteriorPlanRow, InteriorPlanRowGroup } from "@/lib/utils/interiorPlanRows";

type LineGroupProps = {
  group: InteriorPlanRowGroup;
  /** 순서를 바꿀 수 있는 상태(순서 저장 중이 아님). 줄이 하나뿐인 묶음은 이 값과 상관없이 들 수 없다 */
  canReorder: boolean;
  /** 확정을 저장하는 중인 항목 id */
  savingItemIds: ReadonlySet<string>;
  canAddLine: boolean;
  onLineAdd: (trade: string, button: HTMLButtonElement) => void;
  onLineOpen: (row: InteriorPlanRow, button: HTMLButtonElement) => void;
  onConfirmChange: (row: InteriorPlanRow, isConfirmed: boolean) => void;
};

/**
 * 구분 묶음 하나: 제목 → 줄들(이 묶음만의 `SortableContext`) → [+ {구분}에 줄 추가].
 * 묶음마다 `SortableContext`를 따로 둬서 든 줄이 없는 묶음의 줄은 밀리지 않는다(묶음 안에서만 옮긴다).
 */
function LineGroup({
  group,
  canReorder,
  savingItemIds,
  canAddLine,
  onLineAdd,
  onLineOpen,
  onConfirmChange,
}: LineGroupProps) {
  const keys = group.rows.map((row) => row.key);
  const isDraggable = canReorder && group.rows.length > 1;

  return (
    <section className={styles.group} aria-label={group.trade}>
      <h3 className={styles.groupTitle}>{group.trade}</h3>
      <SortableContext id={group.trade} items={keys} strategy={verticalListSortingStrategy}>
        <ul className={styles.rows}>
          {group.rows.map((row) => (
            <LineRow
              key={row.key}
              trade={group.trade}
              row={row}
              isSaving={savingItemIds.has(row.item.id)}
              isDraggable={isDraggable}
              onOpen={(button) => onLineOpen(row, button)}
              onConfirmChange={(isConfirmed) => onConfirmChange(row, isConfirmed)}
            />
          ))}
        </ul>
      </SortableContext>
      <button
        type="button"
        className={styles.groupAddButton}
        aria-haspopup="dialog"
        disabled={!canAddLine}
        onClick={(event) => onLineAdd(group.trade, event.currentTarget)}
      >
        <span aria-hidden="true">+ </span>
        {group.trade}에 줄 추가
      </button>
    </section>
  );
}

export default LineGroup;
