import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateInteriorPlanListCache } from "@/hooks/useInteriorPlanList";
import { apiClient } from "@/lib/api/client";
import { parseInteriorItem } from "@/lib/utils/validateInteriorPlan";

import type {
  InteriorItemInput,
  InteriorItemRequest,
  InteriorItemResponse,
} from "@/lib/types/interiorPlan";

type CreateInteriorItemParams = { planId: string; item: InteriorItemInput };

const createInteriorItem = async ({ planId, item }: CreateInteriorItemParams) => {
  const body = await apiClient.post<InteriorItemResponse>(
    `/api/interior-plans/${encodeURIComponent(planId)}/items`,
    { item } satisfies InteriorItemRequest,
  );
  const created = parseInteriorItem(body.item);
  if (created === null)
    throw new Error("/api/interior-plans/{id}/items 응답 형식이 올바르지 않습니다");
  return created;
};

/** 계획에 항목 하나. id·시각은 서버가 정한다. 받은 항목을 그 계획의 끝에 붙인다(서버 순서 = 만든 시각). */
export function useCreateInteriorItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createInteriorItem,
    onSuccess: (item, { planId }) =>
      updateInteriorPlanListCache(queryClient, (plans) =>
        plans.map((plan) =>
          plan.id === planId ? { ...plan, items: [...plan.items, item] } : plan,
        ),
      ),
  });
}
