import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { isListingOrder } from "@/lib/utils/isListingOrder";

import type { ListingOrderResponse } from "@/lib/types/account";

export const listingOrderQueryKey = () => ["listingOrder", "item"] as const;

/** 서버와 같은 규칙(`isListingOrder`)으로 본다. 어긋나면 조회 실패다. */
const fetchAccountListingOrder = async () => {
  const body = await apiClient.get<Partial<ListingOrderResponse>>("/api/listing-order");
  if (body.ids !== null && !isListingOrder(body.ids)) {
    throw new Error("/api/listing-order 응답 형식이 올바르지 않습니다");
  }
  return body.ids;
};

type AccountListingOrderOptions = {
  enabled: boolean;
  /** 함께 쓰는 중이면 주기 조회 간격(`householdRefetchInterval`), 혼자면 false */
  refetchInterval: number | false;
};

/** 로그인 상태의 직접 정렬 순서(계정 원본, 없으면 null). 창으로 돌아올 때마다 다시 조회해 다른 기기의 변경을 반영한다. 함께 쓰는 중이면 주기적으로도 조회한다. */
export function useAccountListingOrder({ enabled, refetchInterval }: AccountListingOrderOptions) {
  return useQuery({
    queryKey: listingOrderQueryKey(),
    queryFn: fetchAccountListingOrder,
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval,
  });
}
