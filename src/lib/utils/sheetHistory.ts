/**
 * 시트가 열린 동안 쌓아 두는 이력 항목(스펙 interior-tbd-amount "추가 요청"). 모바일 관례대로 뒤로 가기가 시트를 닫는다.
 * 주소(해시)는 그대로라 `hashchange`가 나지 않으므로, 항목 상태(`history.state`)에 시트를 연 쪽의 id를 남겨 알아본다.
 * id는 시트를 여는 쪽(`useOpenSheet`)마다 달라서 화면 시트와 글자 크기 시트의 항목이 섞이지 않는다.
 */
type SheetHistoryState = { sheetHistoryId: string };

/** 지금 이력 항목을 쌓은 시트 쪽 id. 시트가 쌓은 항목이 아니면 null */
export function currentSheetHistoryId(): string | null {
  const state: unknown = window.history.state;
  if (typeof state !== "object" || state === null || !("sheetHistoryId" in state)) return null;
  return typeof state.sheetHistoryId === "string" ? state.sheetHistoryId : null;
}

/** 같은 주소로 항목 하나를 쌓는다(저장소 쓰기가 아니다) */
export function pushSheetHistoryEntry(sheetHistoryId: string) {
  const state: SheetHistoryState = { sheetHistoryId };
  window.history.pushState(state, "");
}
