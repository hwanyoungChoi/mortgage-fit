import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { isListing } from "@/lib/utils/validateListingFields";

import type { ListingListResponse } from "@/lib/types/account";

export const listingListQueryKey = () => ["listing", "list"] as const;

/** 어긋난 항목이 화면 계산에 들어가지 않게 로컬 저장소와 같은 규칙으로 본다. 하나라도 어긋나면 조회 실패다. */
const fetchListingList = async () => {
  const body = await apiClient.get<Partial<ListingListResponse>>("/api/listings");
  if (!Array.isArray(body.listings) || !body.listings.every(isListing)) {
    throw new Error("/api/listings 응답 형식이 올바르지 않습니다");
  }
  return body.listings;
};

type ListingListOptions = {
  enabled: boolean;
  /** 함께 쓰는 중이면 주기 조회 간격(`householdRefetchInterval`), 혼자면 false */
  refetchInterval: number | false;
};

/** 로그인 상태의 저장 목록(서버 원본). 창으로 돌아올 때마다 다시 조회해 다른 기기의 변경을 반영한다. 함께 쓰는 중이면 주기적으로도 조회한다. */
export function useListingList({ enabled, refetchInterval }: ListingListOptions) {
  return useQuery({
    queryKey: listingListQueryKey(),
    queryFn: fetchListingList,
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval,
  });
}
