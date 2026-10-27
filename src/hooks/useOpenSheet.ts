import { useCallback, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { currentSheetHistoryId, pushSheetHistoryEntry } from "@/lib/utils/sheetHistory";

/**
 * 열린 시트 하나(화면마다 한 번에 하나, ADR-017)와 닫을 때 포커스를 돌려줄 자리를 관리한다.
 * `T`는 화면이 정하는 시트 구분(이름이나 시트가 다룰 대상). 시트가 열린 동안 뒤 화면은 `isOpen`으로 inert를 건다(aria-modal이 약속하는 동작).
 * 시트가 열린 동안 같은 주소의 이력 항목 하나를 둔다. 뒤로 가기는 그 항목을 지나며 시트를 닫고(`Sheet`가 듣는다),
 * [닫기]·Esc·저장으로 닫으면 그 항목을 되돌려 뒤로 가기 한 번이 그냥 지나가는 자리가 남지 않는다.
 */
export function useOpenSheet<T>() {
  const [openSheet, setOpenSheet] = useState<T | null>(null);
  // 클릭으로 버튼에 포커스가 가지 않는 브라우저(Safari)가 있어 activeElement 대신 여는 쪽이 자리를 넘긴다.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // 새로고침 뒤 같은 id가 남은 항목을 만나도, 그 항목은 지금 주소의 것이라 그대로 시트 항목으로 쓰면 된다.
  const historyId = useId();

  const open = (sheet: T, returnFocusTo: HTMLElement | null) => {
    returnFocusRef.current = returnFocusTo;
    // 열린 시트를 바꿔 열면(계획 관리 → 만들기) 이미 쌓은 항목을 그대로 쓴다.
    if (currentSheetHistoryId() !== historyId) pushSheetHistoryEntry(historyId);
    setOpenSheet(sheet);
  };

  /**
   * 주소로 들어와 여는 시트(매물 카드 → 만들기). 들어온 이동이 이미 이력 하나라 항목을 쌓지 않는다:
   * 뒤로 가기는 들어온 곳으로 가고, 시트는 화면과 함께 사라진다. 닫아도 되돌릴 항목이 없다.
   */
  const openFromAddress = (sheet: T) => {
    returnFocusRef.current = null;
    setOpenSheet(sheet);
  };

  /** 배경의 inert가 먼저 풀려야 포커스할 수 있으므로 닫기를 동기로 반영한 뒤 포커스를 돌려준다. */
  const dismiss = useCallback(() => {
    flushSync(() => setOpenSheet(null));
    returnFocusRef.current?.focus();
  }, []);

  // 시트가 Esc 리스너를 다시 달지 않도록 같은 함수를 유지한다.
  // 뒤로 가기로 닫을 때는 항목을 이미 지나왔으므로 되돌리지 않는다.
  const close = useCallback(() => {
    dismiss();
    if (currentSheetHistoryId() === historyId) window.history.back();
  }, [dismiss, historyId]);

  /**
   * 닫고 다른 주소로 replace한다(만든 계획으로, 지운 계획에서). 되돌리기는 비동기라 바로 바꾸면 바꾼 주소가 되돌려지므로
   * 쌓은 항목을 되돌린 뒤에 바꾼다. 그래서 바꾸기 전 주소는 이력에 남지 않는다.
   */
  const closeAndReplace = useCallback(
    (path: string) => {
      dismiss();
      if (currentSheetHistoryId() !== historyId) {
        window.location.replace(path);
        return;
      }
      window.addEventListener("popstate", () => window.location.replace(path), { once: true });
      window.history.back();
    },
    [dismiss, historyId],
  );

  return { openSheet, isOpen: openSheet !== null, open, openFromAddress, close, closeAndReplace };
}
