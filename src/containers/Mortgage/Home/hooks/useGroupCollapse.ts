import { useSyncExternalStore } from "react";

import type { InteriorGroupCollapseStore } from "@/lib/types/interiorGroupCollapse";

const NO_TRADES: readonly string[] = [];

/**
 * 이 계획에서 접힌 묶음(구분 글자)과 접기·펴기. 저장소가 화면 밖이라 [목록|표] 전환·재조회·다시 마운트 뒤에도 남는다.
 * `presentTrades`는 지금 화면의 묶음이다(쓸 때 없어진 구분을 정리한다).
 */
export function useGroupCollapse(
  store: InteriorGroupCollapseStore,
  planId: string,
  presentTrades: readonly string[],
) {
  const collapsedByPlan = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const collapsedTrades = new Set(collapsedByPlan.get(planId) ?? NO_TRADES);

  const toggle = (trade: string) =>
    store.setCollapsed({
      planId,
      trade,
      isCollapsed: !collapsedTrades.has(trade),
      presentTrades,
    });

  const isAllCollapsed =
    presentTrades.length > 0 && presentTrades.every((trade) => collapsedTrades.has(trade));
  const toggleAll = () =>
    store.setAllCollapsed({ planId, isCollapsed: !isAllCollapsed, presentTrades });

  return { collapsedTrades, toggle, isAllCollapsed, toggleAll };
}
