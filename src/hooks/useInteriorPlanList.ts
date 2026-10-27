import { useQuery, type QueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { parseInteriorPlanWithItems } from "@/lib/utils/interiorPlanStorage";

import type { InteriorPlanListResponse, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

export const interiorPlanListQueryKey = () => ["interiorPlan", "list"] as const;

/**
 * 어긋난 플랜·항목이 화면 계산에 들어가지 않게 로컬 저장소와 같은 규칙으로 본다(알려진 키만 남김).
 * 하나라도 어긋나면 조회 실패다.
 */
const fetchInteriorPlanList = async () => {
  const body = await apiClient.get<Partial<InteriorPlanListResponse>>("/api/interior-plans");
  const plans = Array.isArray(body.plans)
    ? (body.plans as unknown[]).map(parseInteriorPlanWithItems)
    : null;
  if (plans === null || plans.includes(null)) {
    throw new Error("/api/interior-plans 응답 형식이 올바르지 않습니다");
  }
  return plans as InteriorPlanWithItems[];
};

/**
 * 쓰기 응답으로 받아 둔 목록을 고친다(목록 전체를 다시 받지 않는다, 최악 ~2MB).
 * 쓰기 전에 시작한 재조회가 끝나며 이 결과를 옛 값으로 덮지 않게 먼저 멈춘다.
 */
export async function updateInteriorPlanListCache(
  queryClient: QueryClient,
  update: (plans: InteriorPlanWithItems[]) => InteriorPlanWithItems[],
) {
  await queryClient.cancelQueries({ queryKey: interiorPlanListQueryKey() });
  queryClient.setQueryData<InteriorPlanWithItems[]>(interiorPlanListQueryKey(), (plans) =>
    plans === undefined ? plans : update(plans),
  );
}

type InteriorPlanListOptions = {
  enabled: boolean;
  /** 함께 쓰는 중이면 주기 조회 간격(`householdRefetchInterval`), 혼자면 false */
  refetchInterval: number | false;
};

/** 로그인 상태의 인테리어 계획(서버 원본). 창으로 돌아올 때마다 다시 조회하고, 함께 쓰는 중이면 주기적으로도 조회한다. */
export function useInteriorPlanList({ enabled, refetchInterval }: InteriorPlanListOptions) {
  return useQuery({
    queryKey: interiorPlanListQueryKey(),
    queryFn: fetchInteriorPlanList,
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval,
  });
}
