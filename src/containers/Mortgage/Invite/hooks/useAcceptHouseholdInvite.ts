import { useMutation, useQueryClient } from "@tanstack/react-query";

import { budgetQueryKey } from "@/hooks/useAccountBudget";
import { listingOrderQueryKey } from "@/hooks/useAccountListingOrder";
import { interiorPlanListQueryKey } from "@/hooks/useInteriorPlanList";
import { listingListQueryKey } from "@/hooks/useListingList";
import { meQueryKey } from "@/hooks/useMe";
import { apiClient } from "@/lib/api/client";

import type { MeResponse } from "@/lib/types/account";
import type { AcceptHouseholdInviteResponse } from "@/lib/types/household";

const acceptHouseholdInvite = (token: string) =>
  apiClient.post<AcceptHouseholdInviteResponse>(`/api/household/invites/${token}/accept`);

type AcceptHouseholdInviteOptions = {
  /** 수락에 성공하면 캐시를 바꾸기 전에 부른다. 화면을 먼저 떠나도 불린다(훅 단위 콜백). */
  onAccepted: () => void;
};

/**
 * 초대 수락. 성공하면 me에 가구를 바로 넣고(홈 계정 자리가 곧바로 "함께 쓰는 중"), 목록·예산·순서·인테리어 계획은
 * 가구 단위로 바뀌었으므로 다시 조회한다.
 */
export function useAcceptHouseholdInvite({ onAccepted }: AcceptHouseholdInviteOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptHouseholdInvite,
    onSuccess: ({ household }) => {
      onAccepted();
      queryClient.setQueryData<MeResponse>(meQueryKey(), (me) =>
        me?.user ? { user: { ...me.user, household } } : me,
      );
      void queryClient.invalidateQueries({ queryKey: listingListQueryKey() });
      void queryClient.invalidateQueries({ queryKey: budgetQueryKey() });
      void queryClient.invalidateQueries({ queryKey: listingOrderQueryKey() });
      void queryClient.invalidateQueries({ queryKey: interiorPlanListQueryKey() });
    },
  });
}
