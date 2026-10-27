import type { IdsByUserStore } from "./storage";

/** `loan-calculator/account-imports`: 사용자별로 이 기기에서 그 계정으로 옮긴(또는 옮기지 않기로 한) 매물 id */
export type AccountImportStore = IdsByUserStore;

/** import 실패. limit: 400(계정 500개 상한), network: 연결·서버 오류 */
export type AccountImportFailureReason = "limit" | "network";

/**
 * 이전을 건너뛴 이유. 로컬 목록이 손상됐거나 저장소에 접근할 수 없다.
 * household: 함께 쓰는 중이라 보내지 않았다(기록도 남기지 않아, 같은 세션에서 나가면 다시 한다).
 */
export type AccountImportSkipReason = "corrupt" | "unavailable" | "household";

/** 한 번의 이전 결과. done은 옮길 것이 없거나 옮기지 않기로 한 경우도 포함한다(`importedCount` 0). */
export type AccountImportResult =
  | { status: "done"; importedCount: number }
  | { status: "skipped"; reason: AccountImportSkipReason }
  | { status: "failed"; reason: AccountImportFailureReason; failedCount: number };

/** 어느 사용자의 이전인지 함께 둔다. 다른 사용자로 바뀌면 그 사용자의 이전을 새로 한다. */
export type AccountImportState = { userId: string } & ({ status: "running" } | AccountImportResult);
