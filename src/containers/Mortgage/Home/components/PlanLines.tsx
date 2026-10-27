import Plus from "lucide-react/icons/plus";

import EmptyItems from "./EmptyItems";
import LineRow from "./LineRow";
import styles from "./PlanLines.module.css";
import { useLineConfirmToggle } from "../hooks/useLineConfirmToggle";
import { ITEM_LIMIT_MESSAGE } from "../planWriteFailure";

import type { InteriorItem } from "@/lib/types/interiorPlan";
import type { InteriorPlanSourceWriteResult } from "@/lib/types/interiorPlanStore";
import type { InteriorPlanRow, InteriorPlanRowGroup } from "@/lib/utils/interiorPlanRows";

type PlanLinesProps = {
  groups: InteriorPlanRowGroup[];
  isMasked: boolean;
  /** 항목 수 상한(100개, 줄 수가 아님) 안이다 */
  canAddLine: boolean;
  /** `trade`가 있으면 그 묶음 끝의 [+ {구분}에 줄 추가]다(구분을 채워 연다) */
  onLineAdd: (trade: string | null, button: HTMLButtonElement) => void;
  onLineOpen: (row: InteriorPlanRow, button: HTMLButtonElement) => void;
  /** 목록의 [확정] 체크. 그 줄 항목의 확정만 바꿔 저장한다 */
  onConfirmWrite: (
    item: InteriorItem,
    quoteId: string,
    isConfirmed: boolean,
  ) => Promise<InteriorPlanSourceWriteResult>;
};

const EMPTY_MESSAGE = "아직 줄이 없습니다. 오른쪽 아래 [+]를 눌러 공정별 업체 견적을 적어 보세요";

/**
 * 목록 보기: (상한이면 안내) → 확정 저장 결과 한 줄 → 공정(구분)별 묶음 + 떠 있는 [+](줄 추가).
 * [+]는 화면 오른쪽 아래, 하단 탭 줄 바로 위에 고정이라 줄 수·스크롤과 상관없이 같은 자리다. 목록 보기에만 있고
 * 가리기 중에는 숨긴다(줄 시트를 열지 않는 상태). 시트가 열리면 이 화면과 함께 inert다.
 * 줄 DOM은 key `item.id:quote.id`로 유지돼 저장·폴링 뒤에도 다시 마운트되지 않는다(스크롤 위치 유지).
 */
function PlanLines({
  groups,
  isMasked,
  canAddLine,
  onLineAdd,
  onLineOpen,
  onConfirmWrite,
}: PlanLinesProps) {
  const { savingItemIds, notice, toggle } = useLineConfirmToggle(onConfirmWrite);

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
      {groups.length === 0 ? (
        <EmptyItems message={EMPTY_MESSAGE} />
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => (
            <section key={group.trade} className={styles.group} aria-label={group.trade}>
              <h3 className={styles.groupTitle}>{group.trade}</h3>
              <ul className={styles.rows}>
                {group.rows.map((row) => (
                  <LineRow
                    key={row.key}
                    trade={group.trade}
                    row={row}
                    isMasked={isMasked}
                    isSaving={savingItemIds.has(row.item.id)}
                    onOpen={(button) => onLineOpen(row, button)}
                    onConfirmChange={(isConfirmed) => void toggle(row, isConfirmed)}
                  />
                ))}
              </ul>
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
          ))}
        </div>
      )}
      {!isMasked && (
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
      )}
    </div>
  );
}

export default PlanLines;
