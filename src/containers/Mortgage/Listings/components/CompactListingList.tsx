import {
  DndContext,
  DragOverlay,
  closestCenter,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState, type ComponentProps } from "react";

import { useLongPressSensors } from "@/hooks/useLongPressSensors";
import { SCREEN_READER_INSTRUCTIONS } from "@/lib/constants/dragReorder";

import styles from "./CompactListingList.module.css";
import CompactListingRow from "./CompactListingRow";
import CompactListingSummary from "./CompactListingSummary";
import ListingStatusChip from "./ListingStatusChip";

import type ListingCard from "./ListingCard";
import type { Listing } from "@/lib/types/listing";

type CardProps = Omit<ComponentProps<typeof ListingCard>, "listing">;

type CompactListingListProps = CardProps & {
  /** 보이는 순서 그대로 */
  listings: Listing[];
  label: string;
  canReorder: boolean;
  /** 놓은 뒤의 전체 순서(매물 id). 제자리에 놓으면 부르지 않는다. */
  onReorder: (ids: string[]) => void;
};

/**
 * 간단히 보기 목록. 줄을 들어 끌면 순서를 바꾼다(마우스·터치는 꾹 누르기, 키보드는 스페이스. 센서·안내 문장은 우리 집 줄과 공용).
 * 짧게 떼거나 엔터면 펼치기다.
 * 든 동안에는 든 순간의 목록을 그대로 그린다. 재조회(함께 쓰는 중 30초·창 포커스)로 순서나 매물이 바뀌어도
 * 끄는 줄이 밀리지 않게 하고, 놓은 뒤에 반영한다.
 */
function CompactListingList({
  listings: currentListings,
  label,
  canReorder,
  onReorder,
  ...cardProps
}: CompactListingListProps) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [draggedListings, setDraggedListings] = useState<Listing[] | null>(null);
  const listings = draggedListings ?? currentListings;
  const sensors = useLongPressSensors();
  const ids = listings.map((listing) => listing.id);
  const activeListing = listings.find((listing) => listing.id === activeId) ?? null;

  const nameOf = (id: UniqueIdentifier) =>
    listings.find((listing) => listing.id === id)?.name ?? "";
  const positionOf = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `'${nameOf(active.id)}' 매물을 들었습니다. 전체 ${ids.length}개 중 ${positionOf(active.id)}번째입니다.`,
    onDragOver: ({ active, over }) =>
      over === null
        ? `'${nameOf(active.id)}' 매물이 목록 밖에 있습니다.`
        : `'${nameOf(active.id)}' 매물을 ${positionOf(over.id)}번째 자리로 옮겼습니다.`,
    onDragEnd: ({ active, over }) =>
      over === null
        ? `'${nameOf(active.id)}' 매물을 놓았습니다. 순서는 그대로입니다.`
        : `'${nameOf(active.id)}' 매물을 ${positionOf(over.id)}번째 자리에 놓았습니다.`,
    onDragCancel: ({ active }) =>
      `옮기기를 취소했습니다. '${nameOf(active.id)}' 매물은 ${positionOf(active.id)}번째 자리 그대로입니다.`,
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id);
    setDraggedListings(currentListings);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    setDraggedListings(null);
    if (over === null || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setDraggedListings(null);
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label={label}>
          {listings.map((listing) => (
            <CompactListingRow
              key={listing.id}
              listing={listing}
              canReorder={canReorder}
              {...cardProps}
            />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay>
        {activeListing !== null && (
          <div className={styles.lifted}>
            {activeListing.status !== undefined && (
              <ListingStatusChip status={activeListing.status} />
            )}
            <CompactListingSummary
              listing={activeListing}
              regulations={cardProps.regulations}
              isExpanded={false}
              isMasked={cardProps.isPrivacyMode}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default CompactListingList;
