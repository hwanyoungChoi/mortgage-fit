import { HOUSEHOLD_REFETCH_INTERVAL_MS } from "@/lib/constants/household";

import type { MeResponse } from "@/lib/types/account";
import type { Household } from "@/lib/types/household";

/** 함께 쓰는 목록에 있으면 그 요약, 혼자 쓰거나 로그아웃·확인 전이면 null */
export function householdOf(me: MeResponse | undefined): Household | null {
  return me?.user?.household ?? null;
}

/** 함께 쓰는 중일 때만 주기 조회 간격, 아니면 false(주기 요청 0건, AC-0) */
export function householdRefetchInterval(me: MeResponse | undefined): number | false {
  return householdOf(me) === null ? false : HOUSEHOLD_REFETCH_INTERVAL_MS;
}
