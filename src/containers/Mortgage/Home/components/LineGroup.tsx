import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import LineRow from "./LineRow";
import styles from "./PlanLines.module.css";
import { groupDragIdOf, type LineDragKind } from "../lineDrag";

import type { InteriorPlanRow, InteriorPlanRowGroup } from "@/lib/utils/interiorPlanRows";

type LineGroupProps = {
  group: InteriorPlanRowGroup;
  /** 순서를 바꿀 수 있는 상태(순서 저장 중이 아님). 줄이 하나뿐인 묶음은 이 값과 상관없이 줄을 들 수 없다 */
  canReorder: boolean;
  /** 묶음을 통째로 들 수 있다(순서 저장 중이 아니고 묶음이 2개 이상) */
  canMoveGroup: boolean;
  /** 지금 든 것의 종류. 묶음을 든 동안에는 줄을 끌기에서 뺀다 */
  dragKind: LineDragKind | null;
  /** 확정을 저장하는 중인 항목 id */
  savingItemIds: ReadonlySet<string>;
  canAddLine: boolean;
  onLineAdd: (trade: string, button: HTMLButtonElement) => void;
  onLineOpen: (row: InteriorPlanRow, button: HTMLButtonElement) => void;
  onConfirmChange: (row: InteriorPlanRow, isConfirmed: boolean) => void;
};

/** 보조기기가 읽는 묶음 제목의 역할 이름 */
const GROUP_ROLE_DESCRIPTION = "순서를 바꿀 수 있는 묶음";

/**
 * 구분 묶음 하나: 제목 → 줄들(이 묶음만의 `SortableContext`) → [+ {구분}에 줄 추가].
 * 묶음마다 `SortableContext`를 따로 둬서 든 줄이 없는 묶음의 줄은 밀리지 않는다(줄은 묶음 안에서만 옮긴다).
 * 묶음 제목을 꾹 누르면(키보드는 스페이스) 묶음을 통째로 든다. 묶음을 든 동안 줄은 들 수도 놓을 수도 없다
 * (키보드 이동이 줄 자리로 건너뛰지 않게). 줄을 든 동안 묶음을 놓을 자리에서 빼는 것은 목록의 충돌 판정이 맡는다.
 */
function LineGroup({
  group,
  canReorder,
  canMoveGroup,
  dragKind,
  savingItemIds,
  canAddLine,
  onLineAdd,
  onLineOpen,
  onConfirmChange,
}: LineGroupProps) {
  const keys = group.rows.map((row) => row.key);
  const isDraggable = canReorder && group.rows.length > 1 && dragKind !== "group";
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: groupDragIdOf(group.trade),
    data: { kind: "group" },
    disabled: !canMoveGroup,
    attributes: { roleDescription: GROUP_ROLE_DESCRIPTION },
  });

  return (
    <section
      ref={setNodeRef}
      className={isDragging ? styles.placeholderGroup : styles.group}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={group.trade}
    >
      <h3 className={styles.groupTitle}>
        {canMoveGroup ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            className={styles.groupHandle}
          >
            {group.trade}
          </button>
        ) : (
          group.trade
        )}
      </h3>
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
