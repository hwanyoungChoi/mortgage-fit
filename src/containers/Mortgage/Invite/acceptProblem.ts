import { ApiRequestError } from "@/lib/api/client";

import type { ApiError } from "@/lib/types/api";

/**
 * 수락이 안 된 이유. gone: 없음·끊김·사용됨·만료(404), own: 내가 만든 초대(400 ownInvite),
 * alreadyInHousehold·householdFull·householdLimit: 409 각 코드, unauthorized: 세션 만료(401), network: 그 밖의 오류.
 */
export type AcceptProblem =
  | "gone"
  | "own"
  | "alreadyInHousehold"
  | "householdFull"
  | "householdLimit"
  | "unauthorized"
  | "network";

/** 수락이 보내는 오류 코드. 여기 없는 코드는 연결·서버 오류와 같이 본다. */
const CODE_PROBLEMS: Partial<Record<ApiError["error"], AcceptProblem>> = {
  ownInvite: "own",
  alreadyInHousehold: "alreadyInHousehold",
  householdFull: "householdFull",
  householdLimit: "householdLimit",
};

export function acceptProblemOf(error: unknown): AcceptProblem {
  if (!(error instanceof ApiRequestError)) return "network";
  if (error.status === 401) return "unauthorized";
  if (error.status === 404) return "gone";
  return (error.body === null ? undefined : CODE_PROBLEMS[error.body.error]) ?? "network";
}
