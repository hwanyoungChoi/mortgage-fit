import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId } from "react";

import LineSummary from "./LineSummary";
import styles from "./PlanLines.module.css";
import { lineNameOf } from "../lineName";

import type { LineCheck } from "../hooks/useLineConfirmToggle";
import type { InteriorPlanRow } from "@/lib/utils/interiorPlanRows";

type LineRowProps = {
  /** 묶음 제목(구분). 접근 가능한 이름의 앞머리다 */
  trade: string;
  row: InteriorPlanRow;
  /** 같은 항목의 확정을 저장하는 중(이 줄·형제 줄 모두 잠근다) */
  isSaving: boolean;
  /** 들어 끌 수 있다(줄 2개 이상 묶음이고 순서 저장 중이 아님) */
  isDraggable: boolean;
  onOpen: (button: HTMLButtonElement) => void;
  onCheckChange: (check: LineCheck, isChecked: boolean) => void;
};

/** 줄 오른쪽 체크 두 개(보이는 글자 = 접근 가능한 이름의 끝말) */
const LINE_CHECKS: { check: LineCheck; label: string }[] = [
  { check: "confirm", label: "확정" },
  { check: "done", label: "완료" },
];

/** 보조기기가 읽는 역할 이름. 버튼이면서 끌어 옮길 수 있는 줄이다(저장 목록 줄과 같은 말) */
const ROLE_DESCRIPTION = "순서를 바꿀 수 있는 버튼";

/**
 * 줄 하나: [여는 버튼(세부내용 / 업체 · 견적)]과 [확정]·[완료] 체크를 형제로 둔다(버튼 안에 체크박스를 넣지 않는다).
 * [완료](구매 완료)를 켜면 그 견적을 확정도 하고, [확정]을 끄면 완료도 풀린다(`interiorLineWrites`).
 * 비고(항목 메모)와 견적 없는 줄의 "예산 n원"은 목록에 그리지 않는다(줄 시트·표·CSV·인쇄에는 있다, 스펙 interior-tbd-amount 추가 요청).
 * 체크는 저장된 값 그대로이고, 저장 중에는 원래 상태로 비활성이다. 견적 없는 줄의 체크는 숨기지 않고 비활성으로 이유를 붙인다.
 * 끌기 손잡이는 여는 버튼뿐이다(꾹 누르기·스페이스, ADR-036 U6). 확정 체크는 형제라 손잡이가 될 수 없다.
 * 짧게 누르거나 엔터면 지금처럼 줄 시트가 열린다. 들 수 없는 줄에는 끌기 속성을 붙이지 않는다.
 */
function LineRow({ trade, row, isSaving, isDraggable, onOpen, onCheckChange }: LineRowProps) {
  const noQuoteId = useId();
  const { quote } = row;
  const name = lineNameOf(trade, row);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: row.key,
    disabled: !isDraggable,
    attributes: { roleDescription: ROLE_DESCRIPTION },
  });
  const dragProps = isDraggable ? { ...attributes, ...listeners } : {};

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? styles.placeholderRow : styles.row}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...dragProps}
        className={isDraggable ? styles.draggableOpenButton : styles.openButton}
        aria-haspopup="dialog"
        aria-label={`${name} 열기`}
        onClick={(event) => onOpen(event.currentTarget)}
      >
        <LineSummary row={row} />
      </button>
      {LINE_CHECKS.map(({ check, label }) => (
        <label key={check} className={styles.confirm}>
          <input
            type="checkbox"
            aria-label={`${name} ${label}`}
            checked={check === "done" ? row.isDone : row.isConfirmed}
            disabled={quote === null || isSaving}
            aria-busy={isSaving || undefined}
            aria-describedby={quote === null ? noQuoteId : undefined}
            onChange={(event) => onCheckChange(check, event.currentTarget.checked)}
          />
          <span aria-hidden="true">{label}</span>
        </label>
      ))}
      {quote === null && (
        <span id={noQuoteId} className={styles.screenReaderOnly}>
          견적이 없어 확정할 수 없습니다. 줄을 열어 [확정]을 켜세요
        </span>
      )}
    </li>
  );
}

export default LineRow;
