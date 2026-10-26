import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { householdRefetchInterval } from "@/lib/utils/household";

import type { MeResponse } from "@/lib/types/account";

export const meQueryKey = () => ["me", "item"] as const;

function isHousehold(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "object") return false;
  const { memberCount } = value as Record<string, unknown>;
  return Number.isInteger(memberCount);
}

function isMeResponse(value: unknown): value is MeResponse {
  if (typeof value !== "object" || value === null) return false;
  const { user } = value as Record<string, unknown>;
  if (user === null) return true;
  if (typeof user !== "object") return false;
  const { id, household } = user as Record<string, unknown>;
  return typeof id === "string" && isHousehold(household);
}

/** 모양이 다른 응답(HTML 등)을 로그아웃으로 읽으면 로그인 사용자의 쓰기가 로컬로 샌다. 실패로 본다. */
const fetchMe = async () => {
  const body = await apiClient.get<unknown>("/api/me");
  if (!isMeResponse(body)) throw new Error("/api/me 응답 형식이 올바르지 않습니다");
  return body;
};

/**
 * 로그인 여부와 함께 쓰는 목록. 창으로 돌아오면 다시 물어 다른 탭의 로그인·로그아웃을 반영한다.
 * 함께 쓰는 중이면 주기적으로도 물어 상대가 나간 것을 반영한다(혼자면 주기 요청 없음).
 */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey(),
    queryFn: fetchMe,
    refetchInterval: (query) => householdRefetchInterval(query.state.data),
  });
}
