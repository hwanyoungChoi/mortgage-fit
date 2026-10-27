import { useMutation, useQueryClient } from "@tanstack/react-query";

import { budgetQueryKey } from "@/hooks/useAccountBudget";
import { listingOrderQueryKey } from "@/hooks/useAccountListingOrder";
import { interiorPlanListQueryKey } from "@/hooks/useInteriorPlanList";
import { listingListQueryKey } from "@/hooks/useListingList";
import { meQueryKey } from "@/hooks/useMe";
import { apiClient, ApiRequestError } from "@/lib/api/client";

import type { MeResponse } from "@/lib/types/account";

/** 이미 가구가 없으면(404: 상대가 먼저 나가 해체됨) 나가려던 결과와 같으므로 성공으로 본다. */
async function leaveHousehold() {
  try {
    await apiClient.post<void>("/api/household/leave");
  } catch (error) {
    if (!(error instanceof ApiRequestError && error.status === 404)) throw error;
  }
}

/**
 * 함께 쓰는 목록에서 나간다. me의 가구를 바로 비우고(머리글이 곧바로 [함께 쓰기]), 목록·예산·순서·인테리어 계획이
 * 다시 내 것만이 되므로 me와 함께 다시 조회한다.
 */
export function useLeaveHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leaveHousehold,
    onSuccess: () => {
      queryClient.setQueryData<MeResponse>(meQueryKey(), (me) =>
        me?.user ? { user: { ...me.user, household: null } } : me,
      );
      void queryClient.invalidateQueries({ queryKey: meQueryKey() });
      void queryClient.invalidateQueries({ queryKey: listingListQueryKey() });
      void queryClient.invalidateQueries({ queryKey: budgetQueryKey() });
      void queryClient.invalidateQueries({ queryKey: listingOrderQueryKey() });
      void queryClient.invalidateQueries({ queryKey: interiorPlanListQueryKey() });
    },
  });
}
