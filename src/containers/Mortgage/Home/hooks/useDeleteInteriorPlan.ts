import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateInteriorPlanListCache } from "@/hooks/useInteriorPlanList";
import { apiClient } from "@/lib/api/client";

const deleteInteriorPlan = (planId: string) =>
  apiClient.delete(`/api/interior-plans/${encodeURIComponent(planId)}`);

/** 계획과 그 항목을 지운다(서버는 항목을 함께 지운다). */
export function useDeleteInteriorPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteInteriorPlan,
    onSuccess: (_, planId) =>
      updateInteriorPlanListCache(queryClient, (plans) =>
        plans.filter((plan) => plan.id !== planId),
      ),
  });
}
