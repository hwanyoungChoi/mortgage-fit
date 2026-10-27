import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateInteriorPlanListCache } from "@/hooks/useInteriorPlanList";
import { apiClient } from "@/lib/api/client";
import { parseInteriorPlan } from "@/lib/utils/validateInteriorPlan";

import type {
  InteriorPlanPatch,
  InteriorPlanResponse,
  UpdateInteriorPlanRequest,
} from "@/lib/types/interiorPlan";

type UpdateInteriorPlanParams = { planId: string; patch: InteriorPlanPatch };

const updateInteriorPlan = async ({ planId, patch }: UpdateInteriorPlanParams) => {
  const body = await apiClient.patch<InteriorPlanResponse>(
    `/api/interior-plans/${encodeURIComponent(planId)}`,
    { plan: patch } satisfies UpdateInteriorPlanRequest,
  );
  const plan = parseInteriorPlan(body.plan);
  if (plan === null) throw new Error("/api/interior-plans/{id} 응답 형식이 올바르지 않습니다");
  return plan;
};

/**
 * 계획 필드(이름·예산·매물 연결·공간)만 고친다(PATCH, null이면 지움). 다른 기기가 바꾼 다른 필드는 되돌리지 않는다.
 * 응답에는 항목이 없으므로 받아 둔 항목은 그대로 두고 계획 필드만 바꾼다.
 */
export function useUpdateInteriorPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateInteriorPlan,
    onSuccess: (plan) =>
      updateInteriorPlanListCache(queryClient, (plans) =>
        plans.map((cached) => (cached.id === plan.id ? { ...plan, items: cached.items } : cached)),
      ),
  });
}
