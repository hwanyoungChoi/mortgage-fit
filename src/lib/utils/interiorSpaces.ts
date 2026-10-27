import {
  INTERIOR_BATHROOM_SPACE_PREFIX,
  INTERIOR_LEADING_SPACE_NAMES,
  INTERIOR_ROOM_SPACE_PREFIX,
  INTERIOR_TRAILING_SPACE_NAMES,
} from "@/lib/constants/interiorSpaces";

import type { InteriorItem, InteriorSpace } from "@/lib/types/interiorPlan";

function numbered(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
}

/**
 * 방 n·욕실 m의 기본 공간 이름(AC-1): `전체, 현관, 거실, 주방, 욕실1..m, 방1..n, 베란다`.
 * 방 3·욕실 2면 10개, 방 1·욕실 1이면 7개다.
 */
export function defaultSpaceNames(roomCount: number, bathroomCount: number): string[] {
  return [
    ...INTERIOR_LEADING_SPACE_NAMES,
    ...numbered(INTERIOR_BATHROOM_SPACE_PREFIX, bathroomCount),
    ...numbered(INTERIOR_ROOM_SPACE_PREFIX, roomCount),
    ...INTERIOR_TRAILING_SPACE_NAMES,
  ];
}

/** 기본 공간 목록(이름 순서 = 화면 순서). id는 `createId`가 하나씩 만든다. */
export function createDefaultSpaces(
  roomCount: number,
  bathroomCount: number,
  createId: () => string,
): InteriorSpace[] {
  return defaultSpaceNames(roomCount, bathroomCount).map((name) => ({ id: createId(), name }));
}

/** 그 공간을 가리키는 항목 수. 0이 아니면 공간을 지우지 못한다(AC-5) */
export function countSpaceItems(items: Pick<InteriorItem, "spaceId">[], spaceId: string): number {
  return items.filter((item) => item.spaceId === spaceId).length;
}
