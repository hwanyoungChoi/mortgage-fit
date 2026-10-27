// 저장 목록·홈의 "이 기기 매물을 옮기지 못함" 안내(스펙 interior-planner 태스크 0-1·0-2, AC-10, hub-account 태스크 1-2).
import { describe, expect, it } from "vitest";

import { accountImportProblem } from "./accountImportProblem";

describe("accountImportProblem", () => {
  it("함께 쓰는 중 건너뛰기(household)는 안내하지 않는다", () => {
    expect(
      accountImportProblem({ userId: "u", status: "skipped", reason: "household" }),
    ).toBeNull();
  });

  it("손상·접근 불가 건너뛰기는 다시 시도 없이 안내한다(기존 동작)", () => {
    expect(accountImportProblem({ userId: "u", status: "skipped", reason: "corrupt" })).toEqual({
      message: expect.stringContaining("손상") as string,
      canRetry: false,
    });
    expect(accountImportProblem({ userId: "u", status: "skipped", reason: "unavailable" })).toEqual(
      { message: expect.stringContaining("저장소") as string, canRetry: false },
    );
  });

  it("손상 안내는 로그아웃 자리(홈)를 가리킨다(hub-account AC-3)", () => {
    expect(
      accountImportProblem({ userId: "u", status: "skipped", reason: "corrupt" })?.message,
    ).toContain("홈에서 로그아웃하면");
  });

  it("실패는 남은 개수와 함께 다시 시도할 수 있게 안내한다(기존 동작)", () => {
    expect(
      accountImportProblem({ userId: "u", status: "failed", reason: "limit", failedCount: 3 }),
    ).toEqual({
      message:
        "이 기기의 매물 3개를 옮기지 못했습니다. 계정에는 매물을 500개까지 저장할 수 있습니다",
      canRetry: true,
    });
  });

  it("상태 없음·실행 중·끝남은 null", () => {
    expect(accountImportProblem(null)).toBeNull();
    expect(accountImportProblem({ userId: "u", status: "running" })).toBeNull();
    expect(accountImportProblem({ userId: "u", status: "done", importedCount: 2 })).toBeNull();
  });
});
