import { useRef, useState } from "react";

import { releasesOtherConfirm } from "@/lib/utils/interiorLineWrites";

import {
  CONFIRM_CONFLICT_MESSAGE,
  OTHER_CONFIRM_RELEASED_MESSAGE,
  planWriteFailureMessage,
} from "../planWriteFailure";

import type { InteriorItem } from "@/lib/types/interiorPlan";
import type { InteriorPlanSourceWriteResult } from "@/lib/types/interiorPlanStore";
import type { InteriorPlanRow } from "@/lib/utils/interiorPlanRows";

/**
 * 목록 위 안내 한 줄. error는 저장하지 못한 이유, info는 저장은 됐고 알릴 것이 있을 때.
 * 확정 저장 결과와 줄 순서 저장 실패가 같은 한 줄을 쓴다(ADR-036 조건 5)
 */
export type LineNotice = { kind: "error" | "info"; message: string };

/** 줄의 체크 두 개: [확정]과 [완료](구매 완료). [완료]를 켜면 그 견적을 확정도 한다(`toggleLineDoneInput`) */
export type LineCheck = "confirm" | "done";

/**
 * 목록의 [확정]·[완료] 체크(U4: 시트 없이 바로 저장). 체크·요약은 저장된 값에서만 그린다(낙관적 갱신 없음).
 * 저장 중에는 같은 항목의 모든 줄 체크를 잠근다: 형제 줄 연타가 앞선 변경을 덮거나 거짓 충돌을 내지 않게.
 * `write`는 그 줄 항목의 `updatedAt`으로 쓴다(낡았으면 conflict, A7). 결과는 `onNotice`로 목록 위 안내 줄에 보낸다.
 */
export function useLineConfirmToggle(
  write: (
    item: InteriorItem,
    quoteId: string,
    check: LineCheck,
    isChecked: boolean,
  ) => Promise<InteriorPlanSourceWriteResult>,
  onNotice: (notice: LineNotice | null) => void,
) {
  const [savingItemIds, setSavingItemIds] = useState<ReadonlySet<string>>(() => new Set());
  // 같은 이벤트 안의 두 번째 호출도 막는다(상태는 다음 렌더에 보인다)
  const savingRef = useRef(new Set<string>());

  const setSaving = (itemId: string, isSaving: boolean) => {
    if (isSaving) savingRef.current.add(itemId);
    else savingRef.current.delete(itemId);
    setSavingItemIds(new Set(savingRef.current));
  };

  const toggle = async (row: InteriorPlanRow, check: LineCheck, isChecked: boolean) => {
    const itemId = row.item.id;
    // 견적 없는 줄은 확정할 것이 없다(체크는 비활성이고, 강제로 불려도 쓰지 않는다)
    if (row.quote === null || savingRef.current.has(itemId)) return;
    // [완료]를 켜도 이 견적이 확정되므로 같은 기준으로 알린다
    const releasesOther = releasesOtherConfirm(row.item, row.quote.id, isChecked);
    setSaving(itemId, true);
    const result = await write(row.item, row.quote.id, check, isChecked);
    setSaving(itemId, false);
    if (!result.ok) {
      onNotice({
        kind: "error",
        message:
          result.reason === "conflict"
            ? CONFIRM_CONFLICT_MESSAGE
            : planWriteFailureMessage(result.reason),
      });
      return;
    }
    onNotice(releasesOther ? { kind: "info", message: OTHER_CONFIRM_RELEASED_MESSAGE } : null);
  };

  return { savingItemIds, toggle };
}
