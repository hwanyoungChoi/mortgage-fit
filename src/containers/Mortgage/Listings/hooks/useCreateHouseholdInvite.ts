import { useMutation, useQueryClient } from "@tanstack/react-query";

import { meQueryKey } from "@/hooks/useMe";
import { apiClient, ApiRequestError } from "@/lib/api/client";

import type { CreateHouseholdInviteResponse } from "@/lib/types/household";

const createHouseholdInvite = () =>
  apiClient.post<CreateHouseholdInviteResponse>("/api/household/invites");

/**
 * 함께 쓰기 초대 링크 만들기. 서버가 내 미사용 초대를 먼저 지우므로 앞서 만든 링크는 끊긴다(1인 1초대).
 * 이미 2명(409 householdFull)이면 받아 둔 me가 낡은 것이라 다시 조회해 머리글을 맞춘다.
 */
export function useCreateHouseholdInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createHouseholdInvite,
    onError: (error) => {
      if (error instanceof ApiRequestError && error.body?.error === "householdFull") {
        void queryClient.invalidateQueries({ queryKey: meQueryKey() });
      }
    },
  });
}
