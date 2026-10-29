import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanCreateInput,
  InteriorPlanPatch,
  InteriorPlanWithItems,
} from "./interiorPlan";
import type { StorageWriteResult } from "./storage";

/** 로컬 저장소(`loan-calculator/interior-plans`) 원문을 읽은 결과 */
export type InteriorPlanSnapshot =
  | { status: "ok"; plans: InteriorPlanWithItems[] }
  | { status: "corrupt"; rawText: string }
  | { status: "unavailable" };

/**
 * 로컬 쓰기 실패. corrupt·unavailable: 저장소를 읽지 못함(쓰지 않음) 또는 쓰기 실패(용량 초과 포함),
 * notFound: 그 플랜·항목이 없음(다른 탭에서 삭제), limit: 플랜 3개·항목 100개 상한, invalid: 검증 실패(화면이 먼저 막는다).
 */
export type InteriorPlanWriteFailure = {
  ok: false;
  reason: "corrupt" | "unavailable" | "notFound" | "limit" | "invalid";
};

export type InteriorPlanWriteResult = { ok: true } | InteriorPlanWriteFailure;

/**
 * 로그아웃 상태의 인테리어 플랜 원본. 쓰기마다 저장소를 다시 읽어 바뀐 플랜·항목만 바꿔 쓴다(탭 둘이 서로 통째로 덮지 않게).
 * 쓰기는 서버 API(플랜 POST·PATCH·DELETE, 항목 POST·PUT·DELETE)와 같은 단위다.
 */
export type InteriorPlanStore = {
  getSnapshot: () => InteriorPlanSnapshot;
  subscribe: (listener: () => void) => () => void;
  /** 다른 탭의 `storage` 이벤트처럼 외부에서 바뀌었을 때 구독자에게 알린다. */
  notify: () => void;
  createPlan: (
    input: InteriorPlanCreateInput,
  ) => { ok: true; plan: InteriorPlanWithItems } | InteriorPlanWriteFailure;
  /** 키 없음 = 그대로, null = 지움(서버 PATCH와 같은 규칙) */
  updatePlan: (planId: string, patch: InteriorPlanPatch) => InteriorPlanWriteResult;
  removePlan: (planId: string) => InteriorPlanWriteResult;
  addItem: (
    planId: string,
    input: InteriorItemInput,
  ) => { ok: true; item: InteriorItem } | InteriorPlanWriteFailure;
  /** 항목 전체를 바꾼다(서버 PUT과 같다). `createdAt`은 그대로 둔다. */
  updateItem: (planId: string, itemId: string, input: InteriorItemInput) => InteriorPlanWriteResult;
  removeItem: (planId: string, itemId: string) => InteriorPlanWriteResult;
  /** 손상된 원문을 지운다(사용자가 확인한 뒤에만) */
  reset: () => StorageWriteResult;
};

/**
 * [인테리어]이 그리는 계획 목록. 로컬 스냅샷 3값에 더해 출처가 정해지기 전(loading), 계정 확인 실패(accountError),
 * 서버 조회 실패(loadFailed, 받아 둔 목록이 없을 때만)
 */
export type InteriorPlanListState =
  | InteriorPlanSnapshot
  | { status: "loading" }
  | { status: "accountError" }
  | { status: "loadFailed" };

/**
 * 출처(로컬·서버)의 쓰기 실패. 로컬 사유에 더해 notReady: 출처가 정해지기 전, unauthorized: 401(세션 만료),
 * deletedInHousehold: 함께 쓰는 중 404, network: 연결·서버 오류, conflict: 시트를 연 뒤 다른 사람이 같은 항목을 저장했다(저장하지 않음).
 * 혼자 쓰는 중 404는 notFound다.
 */
export type InteriorPlanSourceWriteFailure = {
  ok: false;
  reason:
    | InteriorPlanWriteFailure["reason"]
    | "notReady"
    | "unauthorized"
    | "deletedInHousehold"
    | "network"
    | "conflict";
};

export type InteriorPlanSourceWriteResult = { ok: true } | InteriorPlanSourceWriteFailure;
