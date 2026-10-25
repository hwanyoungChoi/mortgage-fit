import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { isBudgetAmount } from "@/lib/utils/isBudgetAmount";

import type { BudgetResponse } from "@/lib/types/account";

export const budgetQueryKey = () => ["budget", "item"] as const;

/** 범위 밖 값이 예산 초과 계산에 들어가지 않게 기기 예산과 같은 규칙으로 본다. 어긋나면 조회 실패다. */
const fetchAccountBudget = async () => {
  const body = await apiClient.get<Partial<BudgetResponse>>("/api/budget");
  if (body.budget !== null && !isBudgetAmount(body.budget)) {
    throw new Error("/api/budget 응답 형식이 올바르지 않습니다");
  }
  return body.budget;
};

type AccountBudgetOptions = {
  enabled: boolean;
  /** 함께 쓰는 중이면 주기 조회 간격(`householdRefetchInterval`), 혼자면 false */
  refetchInterval: number | false;
};

/** 로그인 상태의 내 예산(계정 원본, 만원, 없으면 null). 창으로 돌아올 때마다 다시 조회해 다른 기기의 변경을 반영한다. 함께 쓰는 중이면 주기적으로도 조회한다. */
export function useAccountBudget({ enabled, refetchInterval }: AccountBudgetOptions) {
  return useQuery({
    queryKey: budgetQueryKey(),
    queryFn: fetchAccountBudget,
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval,
  });
}
