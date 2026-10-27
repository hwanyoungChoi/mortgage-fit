import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateInteriorPlanListCache } from "@/hooks/useInteriorPlanList";
import { apiClient } from "@/lib/api/client";

type DeleteInteriorItemParams = { planId: string; itemId: string };

const deleteInteriorItem = ({ planId, itemId }: DeleteInteriorItemParams) =>
  apiClient.delete(
    `/api/interior-plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}`,
  );

/** 항목 하나를 지우고 받아 둔 목록에서도 그 항목만 뺀다. */
export function useDeleteInteriorItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteInteriorItem,
    onSuccess: (_, { planId, itemId }) =>
      updateInteriorPlanListCache(queryClient, (plans) =>
        plans.map((plan) =>
          plan.id === planId
            ? { ...plan, items: plan.items.filter((item) => item.id !== itemId) }
            : plan,
        ),
      ),
  });
}
