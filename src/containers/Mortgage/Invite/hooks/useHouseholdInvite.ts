import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

import type { HouseholdInviteResponse } from "@/lib/types/household";

export const householdInviteQueryKey = (token?: string) =>
  token === undefined
    ? (["householdInvite", "item"] as const)
    : (["householdInvite", "item", token] as const);

/** 모양이 다른 응답(HTML 등)은 열 수 있는 초대로 보지 않는다. */
const fetchHouseholdInvite = async (token: string) => {
  const body = await apiClient.get<Partial<HouseholdInviteResponse>>(
    `/api/household/invites/${token}`,
  );
  if (typeof body.expiresAt !== "string") {
    throw new Error("/api/household/invites 응답 형식이 올바르지 않습니다");
  }
  return body as HouseholdInviteResponse;
};

/** 초대가 아직 쓸 수 있는지. 없음·끊김·사용됨·만료는 모두 404다. 모양이 틀린 토큰은 묻지 않는다(`enabled`). */
export function useHouseholdInvite(token: string, { enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: householdInviteQueryKey(token),
    queryFn: () => fetchHouseholdInvite(token),
    enabled,
  });
}
