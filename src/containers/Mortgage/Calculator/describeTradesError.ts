import { ApiRequestError } from "@/lib/api/client";

import type { ApiError } from "@/lib/types/api";

type TradesErrorView = { message: string; canRetry: boolean };

const LOAD_FAILED = "실거래가를 불러오지 못했습니다";

/** 서버 오류 코드별 문구. 다시 시도해도 같은 결과인 것(설정·일일 한도)은 버튼을 두지 않는다. */
const API_ERROR_VIEWS: Record<ApiError["error"], TradesErrorView> = {
  notConfigured: { message: "서버 설정이 끝나지 않았습니다(서비스키 미등록)", canRetry: false },
  quotaExceeded: { message: "오늘 조회 한도를 넘었습니다. 내일 다시 시도하세요", canRetry: false },
  rateLimited: { message: "잠시 뒤 다시 시도하세요", canRetry: true },
  upstreamTimeout: { message: `${LOAD_FAILED}(국토교통부 응답 지연)`, canRetry: true },
  upstream: { message: `${LOAD_FAILED}(국토교통부 응답 오류)`, canRetry: true },
  invalidParams: { message: LOAD_FAILED, canRetry: true },
  methodNotAllowed: { message: LOAD_FAILED, canRetry: true },
  // 실거래가 조회에서는 오지 않는 코드(공유·계정·함께 쓰기 API용)
  unauthorized: { message: LOAD_FAILED, canRetry: true },
  forbidden: { message: LOAD_FAILED, canRetry: true },
  notFound: { message: LOAD_FAILED, canRetry: true },
  shareGone: { message: LOAD_FAILED, canRetry: true },
  payloadTooLarge: { message: LOAD_FAILED, canRetry: true },
  ownInvite: { message: LOAD_FAILED, canRetry: true },
  alreadyInHousehold: { message: LOAD_FAILED, canRetry: true },
  householdFull: { message: LOAD_FAILED, canRetry: true },
  householdLimit: { message: LOAD_FAILED, canRetry: true },
  inHousehold: { message: LOAD_FAILED, canRetry: true },
  internal: { message: LOAD_FAILED, canRetry: true },
};

/** fetch 자체가 실패하면(오프라인 등) TypeError다. */
const NETWORK_ERROR_VIEW: TradesErrorView = {
  message: `${LOAD_FAILED}. 인터넷 연결을 확인하세요`,
  canRetry: true,
};

/** 본문이 ApiError가 아닌 응답(HTML 등)과 예상 밖 오류는 internal과 같이 본다. */
function viewOf(error: unknown): TradesErrorView {
  if (error instanceof ApiRequestError) {
    return error.body === null ? API_ERROR_VIEWS.internal : API_ERROR_VIEWS[error.body.error];
  }
  if (error instanceof TypeError) return NETWORK_ERROR_VIEW;
  return API_ERROR_VIEWS.internal;
}

export function describeTradesError(error: unknown): string {
  return viewOf(error).message;
}

export function canRetryTradesError(error: unknown): boolean {
  return viewOf(error).canRetry;
}
