import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateInteriorPlanListCache } from "@/hooks/useInteriorPlanList";
import { apiClient } from "@/lib/api/client";
import { parseInteriorItem } from "@/lib/utils/validateInteriorPlan";

import type {
  InteriorItemInput,
  InteriorItemRequest,
  InteriorItemResponse,
} from "@/lib/types/interiorPlan";

type UpdateInteriorItemParams = { planId: string; itemId: string; item: InteriorItemInput };

const updateInteriorItem = async ({ planId, itemId, item }: UpdateInteriorItemParams) => {
  const body = await apiClient.put<InteriorItemResponse>(
    `/api/interior-plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}`,
    { item } satisfies InteriorItemRequest,
  );
  const updated = parseInteriorItem(body.item);
  if (updated === null) {
    throw new Error("/api/interior-plans/{id}/items/{itemId} 응답 형식이 올바르지 않습니다");
  }
  return updated;
};

/** 항목 전체를 바꾼다(PUT, 항목 단위 마지막 저장 우선). 받은 항목으로 그 항목만 바꾼다. */
export function useUpdateInteriorItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateInteriorItem,
    onSuccess: (item, { planId }) =>
      updateInteriorPlanListCache(queryClient, (plans) =>
        plans.map((plan) =>
          plan.id === planId
            ? {
                ...plan,
                items: plan.items.map((cached) => (cached.id === item.id ? item : cached)),
              }
            : plan,
        ),
      ),
  });
}
