import {
  DndContext,
  DragOverlay,
  closestCenter,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import Plus from "lucide-react/icons/plus";
import { useState } from "react";

import { useLongPressSensors } from "@/hooks/useLongPressSensors";
import { SCREEN_READER_INSTRUCTIONS } from "@/lib/constants/dragReorder";
import { lineOrderAfterMove } from "@/lib/utils/lineOrderAfterMove";

import EmptyItems from "./EmptyItems";
import LineGroup from "./LineGroup";
import LineSummary from "./LineSummary";
import styles from "./PlanLines.module.css";
import { useLineConfirmToggle } from "../hooks/useLineConfirmToggle";
import { lineNameOf } from "../lineName";
import { ITEM_LIMIT_MESSAGE, lineOrderFailureMessage } from "../planWriteFailure";

import type { LineNotice } from "../hooks/useLineConfirmToggle";
import type { InteriorItem } from "@/lib/types/interiorPlan";
import type { InteriorPlanSourceWriteResult } from "@/lib/types/interiorPlanStore";
import type { InteriorPlanRow, InteriorPlanRowGroup } from "@/lib/utils/interiorPlanRows";

type PlanLinesProps = {
  groups: InteriorPlanRowGroup[];
  /** 항목 수 상한(100개, 줄 수가 아님) 안이다 */
  canAddLine: boolean;
  /** 줄을 들 수 있다(앞선 순서 저장이 끝났다) */
  canReorder: boolean;
  /** `trade`가 있으면 그 묶음 끝의 [+ {구분}에 줄 추가]다(구분을 채워 연다) */
  onLineAdd: (trade: string | null, button: HTMLButtonElement) => void;
  onLineOpen: (row: InteriorPlanRow, button: HTMLButtonElement) => void;
  /** 목록의 [확정] 체크. 그 줄 항목의 확정만 바꿔 저장한다 */
  onConfirmWrite: (
    item: InteriorItem,
    quoteId: string,
    isConfirmed: boolean,
  ) => Promise<InteriorPlanSourceWriteResult>;
  /** 끌어 놓은 뒤의 줄 순서 전체를 저장한다. 부르는 즉시 놓은 순서로 보여야 한다(저장 중 순서) */
  onReorder: (lineOrder: string[]) => Promise<InteriorPlanSourceWriteResult>;
};

const EMPTY_MESSAGE = "아직 줄이 없습니다. 오른쪽 아래 [+]를 눌러 공정별 업체 견적을 적어 보세요";

/** 든 순간의 묶음에서 줄 찾기(묶음, 묶음 안 자리) */
function findLine(groups: readonly InteriorPlanRowGroup[], key: UniqueIdentifier) {
  for (const group of groups) {
    const index = group.rows.findIndex((row) => row.key === key);
    if (index !== -1) return { group, row: group.rows[index], position: index + 1 };
  }
  return null;
}

/**
 * 목록 보기: (상한이면 안내) → 안내 한 줄(확정 저장 결과·순서 저장 실패) → 공정(구분)별 묶음 + 떠 있는 [+](줄 추가).
 * [+]는 화면 오른쪽 아래, 하단 탭 줄 바로 위에 고정이라 줄 수·스크롤과 상관없이 같은 자리다. 목록 보기에만 있다.
 * 시트가 열리면 이 화면과 함께 inert다.
 * 줄 DOM은 key `item.id:quote.id`로 유지돼 저장·폴링 뒤에도 다시 마운트되지 않는다(스크롤 위치 유지).
 * 줄을 꾹 눌러(키보드는 스페이스) 같은 묶음 안에서 옮긴다. 든 동안에는 든 순간의 묶음을 그린다(재조회로 줄이 바뀌어도
 * 끄는 줄이 밀리지 않게, 놓은 뒤 반영). 놓을 때 저장 값은 그 스냅샷과 놓는 순간의 묶음으로 만든다(`lineOrderAfterMove`).
 */
function PlanLines({
  groups,
  canAddLine,
  canReorder,
  onLineAdd,
  onLineOpen,
  onConfirmWrite,
  onReorder,
}: PlanLinesProps) {
  const [notice, setNotice] = useState<LineNotice | null>(null);
  const { savingItemIds, toggle } = useLineConfirmToggle(onConfirmWrite, setNotice);
  const [draggedGroups, setDraggedGroups] = useState<InteriorPlanRowGroup[] | null>(null);
  const [activeKey, setActiveKey] = useState<UniqueIdentifier | null>(null);
  const sensors = useLongPressSensors();
  const shownGroups = draggedGroups ?? groups;
  const activeLine = activeKey === null ? null : findLine(shownGroups, activeKey);

  const nameOfKey = (key: UniqueIdentifier) => {
    const line = findLine(shownGroups, key);
    return line === null ? "" : lineNameOf(line.group.trade, line.row);
  };
  /** over가 든 줄과 같은 묶음이면 그 묶음 안 자리, 아니면 null(묶음 밖) */
  const positionInGroup = (key: UniqueIdentifier, overKey: UniqueIdentifier | undefined) => {
    const line = findLine(shownGroups, key);
    const over = overKey === undefined ? null : findLine(shownGroups, overKey);
    return line === null || over === null || over.group !== line.group ? null : over.position;
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const line = findLine(shownGroups, active.id);
      return line === null
        ? ""
        : `'${nameOfKey(active.id)}' 줄을 들었습니다. ${line.group.trade} 줄 ${line.group.rows.length}개 중 ${line.position}번째입니다.`;
    },
    onDragOver: ({ active, over }) => {
      const position = positionInGroup(active.id, over?.id);
      return position === null
        ? `'${nameOfKey(active.id)}' 줄이 묶음 밖에 있습니다. 놓으면 제자리입니다.`
        : `'${nameOfKey(active.id)}' 줄을 ${position}번째 자리로 옮겼습니다.`;
    },
    onDragEnd: ({ active, over }) => {
      const position = positionInGroup(active.id, over?.id);
      return position === null
        ? `'${nameOfKey(active.id)}' 줄을 놓았습니다. 순서는 그대로입니다.`
        : `'${nameOfKey(active.id)}' 줄을 ${position}번째 자리에 놓았습니다.`;
    },
    onDragCancel: ({ active }) =>
      `옮기기를 취소했습니다. '${nameOfKey(active.id)}' 줄은 ${findLine(shownGroups, active.id)?.position ?? 0}번째 자리 그대로입니다.`,
  };

  const reorder = async (lineOrder: string[]) => {
    const result = await onReorder(lineOrder);
    // 성공하면 앞선 실패 안내를 지운다. 실패하면 저장 중 순서가 풀려 원래 순서로 돌아와 있다
    const message = result.ok ? null : lineOrderFailureMessage(result.reason);
    setNotice(message === null ? null : { kind: "error", message });
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveKey(active.id);
    setDraggedGroups(groups);
  };

  // 고정 해제와 저장 중 순서 설정(onReorder)은 같은 이벤트 안이라 원래 순서가 한 프레임도 보이지 않는다
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const snapshot = draggedGroups;
    setActiveKey(null);
    setDraggedGroups(null);
    const line = snapshot === null ? null : findLine(snapshot, active.id);
    if (snapshot === null || line === null || over === null) return;
    const lineOrder = lineOrderAfterMove(
      snapshot,
      groups,
      line.group.trade,
      String(active.id),
      String(over.id),
    );
    if (lineOrder !== null) void reorder(lineOrder);
  };

  return (
    <div className={styles.lines}>
      {!canAddLine && <p className={styles.limitNote}>{ITEM_LIMIT_MESSAGE}</p>}
      {notice !== null && (
        <p
          className={notice.kind === "error" ? styles.errorNotice : styles.infoNotice}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.message}
        </p>
      )}
      {shownGroups.length === 0 ? (
        <EmptyItems message={EMPTY_MESSAGE} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          // 끌기 알림 영역(role="status")은 body로 보내 목록 위 안내 줄(role="status"·"alert")과 섞이지 않게 한다
          accessibility={{
            announcements,
            screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
            container: document.body,
          }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveKey(null);
            setDraggedGroups(null);
          }}
        >
          <div className={styles.groups}>
            {shownGroups.map((group) => (
              <LineGroup
                key={group.trade}
                group={group}
                canReorder={canReorder}
                savingItemIds={savingItemIds}
                canAddLine={canAddLine}
                onLineAdd={onLineAdd}
                onLineOpen={onLineOpen}
                onConfirmChange={(row, isConfirmed) => void toggle(row, isConfirmed)}
              />
            ))}
          </div>
          {/* 뜬 줄은 버튼·체크 없는 표시라 보조기기에서 뺀다(이름·체크가 겹치지 않게) */}
          <DragOverlay>
            {activeLine !== null && (
              <div className={styles.liftedRow} aria-hidden="true">
                <LineSummary row={activeLine.row} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
      <button
        type="button"
        className={styles.addFab}
        aria-label="줄 추가"
        aria-haspopup="dialog"
        disabled={!canAddLine}
        onClick={(event) => onLineAdd(null, event.currentTarget)}
      >
        <Plus size={28} aria-hidden="true" />
      </button>
    </div>
  );
}

export default PlanLines;
