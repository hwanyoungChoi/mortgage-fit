import type { IdsByUserStore } from "./storage";

/** `loan-calculator/interior-plan-imports`: 사용자별로 이 기기에서 그 계정으로 옮긴 인테리어 계획 id */
export type InteriorPlanImportStore = IdsByUserStore;

/**
 * import 실패. limit: 400(계정 계획 3개 상한), network: 연결·서버 오류,
 * tooLarge: 보낼 본문이 서버 한도(1MB)를 넘어 보내지 않았다(다시 해도 같다).
 */
export type InteriorPlanImportFailureReason = "limit" | "network" | "tooLarge";

/**
 * 이전을 건너뛴 이유. corrupt·unavailable: 이 기기의 계획 원문을 읽지 못했다.
 * household: 함께 쓰는 중이라 보내지 않았다(기록도 남기지 않아, 같은 세션에서 나가면 다시 한다).
 * serverHousehold: 서버가 409 `inHousehold`로 거절했다(`/api/me`가 아직 혼자로 보였다). me가 가구를 보이면 household로 바뀐다.
 */
export type InteriorPlanImportSkipReason =
  "corrupt" | "unavailable" | "household" | "serverHousehold";

/** 한 번의 이전 결과. done은 옮길 것이 없거나 이미 계정에 있던 경우도 포함한다(`importedCount` 0). */
export type InteriorPlanImportResult =
  | { status: "done"; importedCount: number }
  | { status: "skipped"; reason: InteriorPlanImportSkipReason }
  | { status: "failed"; reason: InteriorPlanImportFailureReason; failedCount: number };

/** 어느 사용자의 이전인지 함께 둔다. 다른 사용자로 바뀌면 그 사용자의 이전을 새로 한다. */
export type InteriorPlanImportState = { userId: string } & (
  { status: "running" } | InteriorPlanImportResult
);
