// 우리 집의 "이 기기 계획을 옮기지 못함" 안내 문구. 로그아웃은 홈에만 있으므로 홈 기준으로 안내한다(hub-account AC-3, ADR-035 조건 4).
import { describe, expect, it } from "vitest";

import { interiorPlanImportProblem } from "./interiorPlanImportProblem";

describe("interiorPlanImportProblem: 로그아웃 안내는 홈 기준", () => {
  it("손상 건너뛰기: 홈에서 로그아웃하면 원문을 복사할 수 있다고 안내한다", () => {
    expect(
      interiorPlanImportProblem({ userId: "u", status: "skipped", reason: "corrupt" })?.message,
    ).toContain("홈에서 로그아웃하면");
  });

  it("크기 초과: 홈에서 로그아웃한 뒤 메모를 줄이라고 안내한다", () => {
    expect(
      interiorPlanImportProblem({
        userId: "u",
        status: "failed",
        reason: "tooLarge",
        failedCount: 1,
      })?.message,
    ).toContain("홈에서 로그아웃한 뒤");
  });
});
