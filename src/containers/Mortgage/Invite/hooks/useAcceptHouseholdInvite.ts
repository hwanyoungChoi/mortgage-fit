import { useMutation, useQueryClient } from "@tanstack/react-query";

import { budgetQueryKey } from "@/hooks/useAccountBudget";
import { listingOrderQueryKey } from "@/hooks/useAccountListingOrder";
import { listingListQueryKey } from "@/hooks/useListingList";
import { meQueryKey } from "@/hooks/useMe";
import { apiClient } from "@/lib/api/client";

import type { MeResponse } from "@/lib/types/account";
import type { AcceptHouseholdInviteResponse } from "@/lib/types/household";

const acceptHouseholdInvite = (token: string) =>
  apiClient.post<AcceptHouseholdInviteResponse>(`/api/household/invites/${token}/accept`);

/**
 * 초대 수락. 성공하면 me에 가구를 바로 넣고(저장 목록 머리글이 곧바로 "함께 쓰는 중"), 목록·예산·순서는
 * 가구 단위로 바뀌었으므로 다시 조회한다.
 */
export function useAcceptHouseholdInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptHouseholdInvite,
    onSuccess: ({ household }) => {
      queryClient.setQueryData<MeResponse>(meQueryKey(), (me) =>
        me?.user ? { user: { ...me.user, household } } : me,
      );
      void queryClient.invalidateQueries({ queryKey: listingListQueryKey() });
      void queryClient.invalidateQueries({ queryKey: budgetQueryKey() });
      void queryClient.invalidateQueries({ queryKey: listingOrderQueryKey() });
    },
  });
}
