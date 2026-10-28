import { arrayMove } from "@dnd-kit/sortable";

import type { InteriorPlanRowGroup } from "./interiorPlanRows";

const keysOf = (group: InteriorPlanRowGroup) => group.rows.map(({ key }) => key);

/**
 * 묶음 안 끌어 옮기기 한 번 → 저장할 줄 순서(`lineOrder`, ADR-036 조건 4). 쓰지 않을 때는 null이다.
 * 입력은 든 순간의 묶음 스냅샷과 놓는 순간의 현재 묶음이다(끄는 동안 재조회로 줄이 바뀔 수 있다).
 * - 옮긴 묶음 = 스냅샷 묶음에서 `arrayMove(active → over)`한 결과 중 현재 묶음에 남은 key + 현재 묶음에 새로 생긴 key(현재 순서)
 * - 다른 묶음 = 놓는 순간의 현재 값. 돌려주는 배열은 현재 묶음 순서대로 이어 붙인 것이라 묶음 순서가 바뀌지 않고,
 *   지워진 key는 걷히고, 개수는 현재 줄 수(≤ 500)다. 줄 key는 서로 달라 `parseLineOrder`를 늘 통과한다.
 * - null: 제자리, over가 그 묶음 밖이거나 없는 key, 든 줄이 현재 묶음에 없음(지워졌거나 구분이 바뀜)
 */
export function lineOrderAfterMove(
  snapshotGroups: readonly InteriorPlanRowGroup[],
  currentGroups: readonly InteriorPlanRowGroup[],
  groupTrade: string,
  activeKey: string,
  overKey: string,
): string[] | null {
  const trade = groupTrade.trim();
  const snapshot = snapshotGroups.find((group) => group.trade === trade);
  const current = currentGroups.find((group) => group.trade === trade);
  if (snapshot === undefined || current === undefined || activeKey === overKey) return null;
  const snapshotKeys = keysOf(snapshot);
  const from = snapshotKeys.indexOf(activeKey);
  const to = snapshotKeys.indexOf(overKey);
  const currentKeys = keysOf(current);
  if (from === -1 || to === -1 || !currentKeys.includes(activeKey)) return null;
  const currentKeySet = new Set(currentKeys);
  const kept = arrayMove(snapshotKeys, from, to).filter((key) => currentKeySet.has(key));
  const keptSet = new Set(kept);
  const moved = [...kept, ...currentKeys.filter((key) => !keptSet.has(key))];
  return currentGroups.flatMap((group) => (group.trade === trade ? moved : keysOf(group)));
}
