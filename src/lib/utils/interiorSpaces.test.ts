import { describe, expect, it } from "vitest";

import {
  DEFAULT_INTERIOR_BATHROOM_COUNT,
  DEFAULT_INTERIOR_ROOM_COUNT,
  INTERIOR_BATHROOM_COUNTS,
  INTERIOR_ROOM_COUNTS,
} from "@/lib/constants/interiorSpaces";

import { countSpaceItems, createDefaultSpaces, defaultSpaceNames } from "./interiorSpaces";
import { validateInteriorPlanFields } from "./validateInteriorPlan";

describe("기본 공간 (AC-1, U2)", () => {
  it("방 3·욕실 2 → 정확히 10개: 전체, 현관, 거실, 주방, 욕실1, 욕실2, 방1, 방2, 방3, 베란다", () => {
    expect(defaultSpaceNames(3, 2)).toEqual([
      "전체",
      "현관",
      "거실",
      "주방",
      "욕실1",
      "욕실2",
      "방1",
      "방2",
      "방3",
      "베란다",
    ]);
  });

  it("방 1·욕실 1 → 7개(욕실1·방1만)", () => {
    expect(defaultSpaceNames(1, 1)).toEqual([
      "전체",
      "현관",
      "거실",
      "주방",
      "욕실1",
      "방1",
      "베란다",
    ]);
  });

  it("방·욕실 수 기본값은 3·2다", () => {
    expect(DEFAULT_INTERIOR_ROOM_COUNT).toBe(3);
    expect(DEFAULT_INTERIOR_BATHROOM_COUNT).toBe(2);
    expect(INTERIOR_ROOM_COUNTS).toEqual([1, 2, 3, 4, 5]);
    expect(INTERIOR_BATHROOM_COUNTS).toEqual([1, 2, 3]);
  });

  it("선택지 끝값 방 5·욕실 3 → 13개, 이름이 겹치지 않는다", () => {
    const names = defaultSpaceNames(5, 3);
    expect(names).toHaveLength(13);
    expect(names.slice(4, 12)).toEqual([
      "욕실1",
      "욕실2",
      "욕실3",
      "방1",
      "방2",
      "방3",
      "방4",
      "방5",
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(
    INTERIOR_ROOM_COUNTS.flatMap((rooms) =>
      INTERIOR_BATHROOM_COUNTS.map((baths) => [rooms, baths] as const),
    ),
  )(
    "방 %i·욕실 %i 기본 공간은 공용 검증을 통과한다(이름 1~20자, 공간 30개 이하)",
    (rooms, baths) => {
      let next = 0;
      const spaces = createDefaultSpaces(rooms, baths, () => `id${(next += 1)}`);
      expect(spaces).toHaveLength(5 + rooms + baths);
      expect(validateInteriorPlanFields({ name: "우리 집", spaces })).not.toBeNull();
    },
  );

  it("createDefaultSpaces는 이름 순서대로 createId를 한 번씩 불러 id를 붙인다", () => {
    let next = 0;
    const spaces = createDefaultSpaces(1, 1, () => `s${(next += 1)}`);
    expect(spaces).toEqual([
      { id: "s1", name: "전체" },
      { id: "s2", name: "현관" },
      { id: "s3", name: "거실" },
      { id: "s4", name: "주방" },
      { id: "s5", name: "욕실1" },
      { id: "s6", name: "방1" },
      { id: "s7", name: "베란다" },
    ]);
  });
});

describe("countSpaceItems (AC-5 항목 있는 공간 삭제 막기)", () => {
  const items = [{ spaceId: "a" }, { spaceId: "b" }, { spaceId: "a" }];

  it("그 공간을 가리키는 항목 수", () => {
    expect(countSpaceItems(items, "a")).toBe(2);
    expect(countSpaceItems(items, "b")).toBe(1);
  });

  it("항목이 없으면 0(지울 수 있다)", () => {
    expect(countSpaceItems(items, "c")).toBe(0);
    expect(countSpaceItems([], "a")).toBe(0);
  });
});
