import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { budgetQueryKey } from "./useAccountBudget";
import { listingOrderQueryKey } from "./useAccountListingOrder";
import { interiorPlanListQueryKey } from "./useInteriorPlanList";
import { listingListQueryKey } from "./useListingList";
import { meQueryKey } from "./useMe";

import type { SessionHintStore } from "@/lib/types/sessionHint";

/**
 * 로그아웃 상태로 바꾼다(로그아웃 성공, 401). 서버 목록·계정 예산·계정 순서·인테리어 계획 캐시를 지워 같은 탭에서 다음 계정이 이전 값을 보지 않게 한다.
 * 로그인은 페이지 전체 이동이라 캐시가 저절로 비지만 로그아웃은 SPA 안이다.
 */
export function useEndSession(sessionHintStore: SessionHintStore) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    sessionHintStore.clear();
    queryClient.setQueryData(meQueryKey(), { user: null });
    queryClient.removeQueries({ queryKey: listingListQueryKey() });
    queryClient.removeQueries({ queryKey: budgetQueryKey() });
    queryClient.removeQueries({ queryKey: listingOrderQueryKey() });
    queryClient.removeQueries({ queryKey: interiorPlanListQueryKey() });
  }, [queryClient, sessionHintStore]);
}
