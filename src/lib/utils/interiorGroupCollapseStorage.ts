import type {
  CollapsedGroupsByPlan,
  InteriorGroupCollapseStore,
} from "@/lib/types/interiorGroupCollapse";

/** 새 키(ADR-039). 원문은 JSON 객체 `{ [planId]: 접힌 구분[] }` */
export const INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY = "loan-calculator/interior-collapsed-groups";

/**
 * 원문을 관용으로 읽는다: JSON이 아니거나 객체가 아니면 모두 펼침, 계획 값이 배열이 아니면 그 계획만 버리고
 * 배열 안 문자열이 아닌 값은 버린다. 결과는 Map이라 계획 id가 `__proto__`여도 안전하다.
 */
export function parseCollapsedGroups(raw: string | null): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (raw === null) return result;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return result;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return result;
  for (const [planId, value] of Object.entries(parsed)) {
    if (!Array.isArray(value)) continue;
    const trades = value.filter((trade): trade is string => typeof trade === "string");
    if (trades.length > 0) result.set(planId, trades);
  }
  return result;
}

function loadCollapsedGroups(storage: Storage): Map<string, string[]> {
  try {
    return parseCollapsedGroups(storage.getItem(INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY));
  } catch {
    return new Map();
  }
}

/** 접거나 편 뒤 그 계획의 접힌 구분. 지금 화면에 없는 구분(이름이 바뀌었거나 지워진 묶음)은 뺀다 */
function collapsedTradesAfter(
  current: readonly string[],
  trade: string,
  isCollapsed: boolean,
  presentTrades: readonly string[],
): string[] {
  const present = new Set(presentTrades);
  const others = current.filter((name) => name !== trade && present.has(name));
  return isCollapsed ? [...others, trade] : others;
}

/**
 * 메모리 상태가 원본이고 storage에는 최선으로 기록한다(접근 불가·용량 초과면 이 탭에서만 유지, 안내 없음).
 * 접고 펼 때(줄 저장 뒤 자동 펼침 포함)만 쓴다. 다른 탭의 변경은 다음 마운트 때 읽는다.
 */
export function createInteriorGroupCollapseStore({
  storage,
}: {
  storage: Storage;
}): InteriorGroupCollapseStore {
  const listeners = new Set<() => void>();
  let collapsedByPlan: CollapsedGroupsByPlan = loadCollapsedGroups(storage);

  return {
    getSnapshot: () => collapsedByPlan,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setCollapsed({ planId, trade, isCollapsed, presentTrades }) {
      const current = collapsedByPlan.get(planId) ?? [];
      // 이미 그 상태면 쓰지 않는다(펼친 묶음에 줄을 저장해도 원문이 그대로다)
      if (current.includes(trade) === isCollapsed) return;
      const trades = collapsedTradesAfter(current, trade, isCollapsed, presentTrades);
      const next = new Map(collapsedByPlan);
      if (trades.length === 0) next.delete(planId);
      else next.set(planId, trades);
      collapsedByPlan = next;
      for (const listener of listeners) listener();
      try {
        storage.setItem(
          INTERIOR_COLLAPSED_GROUPS_STORAGE_KEY,
          JSON.stringify(Object.fromEntries(next)),
        );
      } catch {
        // 접근 불가·용량 초과: 이 탭에서만 유지한다.
      }
    },
  };
}
