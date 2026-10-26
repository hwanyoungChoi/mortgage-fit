import { INTERIOR_TRADES } from "@/lib/constants/interiorPlan";

import type { InteriorItem } from "@/lib/types/interiorPlan";

/**
 * 항목들의 공종을 공정 순서로 한 번씩 늘어놓는다(AC-3).
 * 프리셋(`INTERIOR_TRADES`)과 이름이 같은 공종은 그 순서, 직접 입력 공종은 그 뒤에 입력순이다.
 * 입력순 = 그 공종을 가진 항목 중 가장 먼저 만든 항목의 `createdAt` 순(같으면 목록 순서). 나중에 공종 이름을 고쳐도
 * 그 항목을 만든 시점으로 센다. 로컬 목록과 서버 GET(`ORDER BY created_at, id`)이 같은 순서가 된다.
 */
export function sortInteriorTrades(items: Pick<InteriorItem, "trade" | "createdAt">[]): string[] {
  // 문자열 비교가 시각 비교다(`toISOString` 고정 형식). sort는 안정 정렬이라 같은 시각은 목록 순서를 지킨다.
  const byCreation = items.toSorted((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );
  const trades = new Set(byCreation.map((item) => item.trade));
  const presets = INTERIOR_TRADES.filter((trade) => trades.has(trade));
  const custom = [...trades].filter((trade) => !INTERIOR_TRADES.includes(trade));
  return [...presets, ...custom];
}
