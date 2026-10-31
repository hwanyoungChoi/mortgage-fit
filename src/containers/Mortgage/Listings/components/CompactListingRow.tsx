import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef, useState, type ComponentProps } from "react";

import styles from "./CompactListingRow.module.css";
import CompactListingSummary from "./CompactListingSummary";
import ListingCard from "./ListingCard";
import ListingStatusButton from "./ListingStatusButton";

type CompactListingRowProps = ComponentProps<typeof ListingCard> & {
  /** 순서를 바꿀 수 있는 상태인지(순서 출처가 정해졌고 저장 중이 아님) */
  canReorder: boolean;
};

/** 보조기기가 읽는 역할 이름. 버튼이면서 끌어 옮길 수 있는 줄이다. */
const ROLE_DESCRIPTION = "순서를 바꿀 수 있는 버튼";

/**
 * 간단히 보기의 한 줄: 상태 칩, 이름과 필요한 자기자금. 줄을 누르면 그 자리에 상세를 펼치고(줄은 오른쪽 위 꺾쇠만 남는다), 다시 누르면 접는다.
 * 꾹 누르거나(스페이스 키) 들어 끌면 순서를 바꾼다(ADR-026). 펼친 줄은 들 수 없고(접은 뒤 끈다) 다른 줄이 지나갈 자리는 된다.
 * 상태 칩은 줄 버튼 밖 형제 버튼이라 누르면 펼치거나 들지 않고 고르기 시트만 뜬다. 미지정은 좁은 줄에 두지 않고 펼친 카드에서 정한다.
 * 가리기 모드에서는 펼친 카드의 [보기]로 이 줄과 카드를 잠깐 보이고, 접으면 다시 가린다.
 */
function CompactListingRow({ canReorder, ...props }: CompactListingRowProps) {
  const {
    listing,
    regulations,
    isPrivacyMode,
    revealedId,
    onRevealChange,
    onStatusOpen,
    statusFailure,
  } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const rowButtonRef = useRef<HTMLButtonElement | null>(null);
  const isDraggable = canReorder && !isExpanded;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: listing.id,
    disabled: { draggable: !isDraggable, droppable: !canReorder },
    attributes: { roleDescription: ROLE_DESCRIPTION },
  });
  // 들 수 없을 때는 끌기 속성(aria-disabled 등)을 붙이지 않는다. 펼치기 버튼으로는 계속 쓸 수 있다.
  const dragProps = isDraggable ? { ...attributes, ...listeners } : {};
  const isRevealed = revealedId === listing.id;
  const hasStatus = listing.status !== undefined;
  // 펼친 카드가 같은 안내를 보이므로 접힌 줄에만 둔다.
  const rowStatusError =
    !isExpanded && statusFailure?.listingId === listing.id ? statusFailure.message : null;

  const handleToggle = () => {
    if (isExpanded && isRevealed) onRevealChange(null);
    setIsExpanded((isOpen) => !isOpen);
  };

  const setRowButtonRef = (node: HTMLButtonElement | null) => {
    setActivatorNodeRef(node);
    rowButtonRef.current = node;
  };

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? styles.placeholder : styles.item}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div
        className={
          isExpanded ? styles.lineExpanded : hasStatus ? styles.lineWithStatus : styles.line
        }
      >
        {/* 지우면 칩이 사라지므로 시트를 닫으면 포커스는 줄로 돌아간다. */}
        {hasStatus && !isExpanded && (
          <ListingStatusButton
            listing={listing}
            className={styles.statusButton}
            onClick={() => onStatusOpen(listing, rowButtonRef.current)}
          />
        )}
        <button
          ref={setRowButtonRef}
          type="button"
          {...dragProps}
          className={isDraggable ? styles.draggableRow : styles.row}
          aria-expanded={isExpanded}
          onClick={handleToggle}
        >
          <CompactListingSummary
            listing={listing}
            regulations={regulations}
            isExpanded={isExpanded}
            isMasked={isPrivacyMode && !isRevealed}
          />
        </button>
      </div>
      {rowStatusError !== null && (
        <p role="alert" className={styles.statusError}>
          {rowStatusError}
        </p>
      )}
      {isExpanded && (
        <div className={styles.detail}>
          <ListingCard {...props} />
        </div>
      )}
    </li>
  );
}

export default CompactListingRow;
