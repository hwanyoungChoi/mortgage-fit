/** 인테리어 목록에서 접은 구분 묶음(이 기기, ADR-039). 계획 id → 접힌 묶음의 구분 글자(trim한 값). 없으면 모두 펼침 */
export type CollapsedGroupsByPlan = ReadonlyMap<string, readonly string[]>;

export type InteriorGroupCollapseStore = {
  getSnapshot: () => CollapsedGroupsByPlan;
  subscribe: (listener: () => void) => () => void;
  /** 그 계획의 한 묶음을 접거나 편다(이미 그 상태면 아무것도 안 한다). 쓸 때 `presentTrades`(지금 화면의 묶음)에 없는 구분은 정리한다 */
  setCollapsed: (input: {
    planId: string;
    trade: string;
    isCollapsed: boolean;
    presentTrades: readonly string[];
  }) => void;
  /** 그 계획의 묶음을 한꺼번에 접거나 편다. 접으면 `presentTrades`(지금 화면의 묶음) 전부가 접힌다 */
  setAllCollapsed: (input: {
    planId: string;
    isCollapsed: boolean;
    presentTrades: readonly string[];
  }) => void;
};
