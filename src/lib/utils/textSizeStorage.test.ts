import { describe, expect, it } from "vitest";

import { createMemoryStorage } from "@/test/memoryStorage";

import { loadTextSize, TEXT_SIZE_STORAGE_KEY } from "./textSizeStorage";

describe("loadTextSize", () => {
  it("키 없음은 기본(smaller, 원래 크기보다 한 단계 작음)이다", () => {
    expect(loadTextSize(createMemoryStorage({}))).toBe("smaller");
  });

  it.each(["default", "smaller", "smallest"] as const)("저장된 %s는 그대로 읽는다", (size) => {
    expect(loadTextSize(createMemoryStorage({ [TEXT_SIZE_STORAGE_KEY]: size }))).toBe(size);
  });

  it("없어진 값 small·모르는 값은 기본이다", () => {
    expect(loadTextSize(createMemoryStorage({ [TEXT_SIZE_STORAGE_KEY]: "small" }))).toBe("smaller");
    expect(loadTextSize(createMemoryStorage({ [TEXT_SIZE_STORAGE_KEY]: "huge" }))).toBe("smaller");
  });
});
