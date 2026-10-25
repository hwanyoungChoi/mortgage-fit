import { useCallback, useEffect, useRef, useState } from "react";

import { useAccountBudget } from "@/hooks/useAccountBudget";
import { useImportBudget } from "@/hooks/useImportBudget";
import { useMe } from "@/hooks/useMe";
import { useSaveBudget } from "@/hooks/useSaveBudget";
import { ApiRequestError } from "@/lib/api/client";
import { householdRefetchInterval } from "@/lib/utils/household";

import { useBudget } from "./useBudget";

import type {
  BudgetImportStore,
  BudgetSaveFailure,
  BudgetSaveResult,
  BudgetState,
  BudgetStore,
} from "@/lib/types/budget";
import type { ListingSourceStatus } from "@/lib/types/listing";

type BudgetSourceOptions = {
  /** 저장 목록과 같은 출처 상태를 따른다. */
  status: ListingSourceStatus;
  /** 로그아웃 상태의 원본. 로그인 중에는 이전 때 읽기만 한다(AC-0). */
  budgetStore: BudgetStore;
  budgetImportStore: BudgetImportStore;
  /** 401일 때 목록과 같은 세션 만료 처리 */
  onUnauthorized: () => void;
};

export type BudgetSource = {
  state: BudgetState;
  save: (budget: number | null) => Promise<BudgetSaveResult>;
  /** 실패한 이전 또는 계정 예산 조회를 다시 한다 */
  retry: () => void;
  isRetrying: boolean;
};

/** 이 사용자의 첫 로그인 예산 이전. 화면에 들어올 때마다 기록을 보고 끝난 사용자는 건너뛴다. */
type BudgetImportState = { userId: string; status: "running" | "done" | "failed" };

const NOT_READY: BudgetSaveFailure = { ok: false, reason: "notReady" };

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

/**
 * 예산 줄의 출처. 로그아웃이면 기기 예산(지금 그대로), 로그인이면 계정 예산이다.
 * 로그인 상태에서는 이 기기의 첫 이전(기기 예산이 있으면 계정이 비어 있을 때만 채움)을 끝낸 뒤 조회하고,
 * 이전·조회 중이거나 실패하면 기기 예산으로 대신 보이지 않는다.
 */
export function useBudgetSource({
  status,
  budgetStore,
  budgetImportStore,
  onUnauthorized,
}: BudgetSourceOptions): BudgetSource {
  const deviceBudget = useBudget(budgetStore);
  const me = useMe();
  const userId = status === "loggedIn" ? (me.data?.user?.id ?? null) : null;
  const [importState, setImportState] = useState<BudgetImportState | null>(null);
  const isImportRunningRef = useRef(false);
  const { mutateAsync: sendImport } = useImportBudget();
  const saveBudget = useSaveBudget();
  const isImportDone =
    userId !== null && importState?.userId === userId && importState.status === "done";
  const accountBudget = useAccountBudget({
    enabled: isImportDone,
    refetchInterval: householdRefetchInterval(me.data),
  });

  const runImport = useCallback(
    async (targetUserId: string) => {
      if (isImportRunningRef.current) return;
      isImportRunningRef.current = true;
      setImportState({ userId: targetUserId, status: "running" });
      let nextStatus: BudgetImportState["status"] = "done";
      if (!budgetImportStore.has(targetUserId)) {
        const budget = budgetStore.getSnapshot();
        try {
          // 응답(계정의 현재 값)은 훅이 캐시에 넣는다. 기기 예산이 없으면 올리지 않고 기록만 남긴다.
          if (budget !== null) await sendImport(budget);
          budgetImportStore.add(targetUserId);
        } catch (error) {
          if (isUnauthorized(error)) onUnauthorized();
          nextStatus = "failed";
        }
      }
      isImportRunningRef.current = false;
      setImportState({ userId: targetUserId, status: nextStatus });
    },
    [budgetImportStore, budgetStore, sendImport, onUnauthorized],
  );

  useEffect(() => {
    if (userId === null || importState?.userId === userId) return;
    void runImport(userId);
  }, [userId, importState, runImport]);

  // 창 포커스 재조회에서 세션이 끝난 것을 알게 되는 경우
  const isBudgetUnauthorized = isUnauthorized(accountBudget.error);
  useEffect(() => {
    if (isBudgetUnauthorized) onUnauthorized();
  }, [isBudgetUnauthorized, onUnauthorized]);

  const selectState = (): BudgetState => {
    if (status === "loggedOut") return { status: "ok", budget: deviceBudget };
    if (status === "error") return { status: "accountError" };
    if (status === "loading" || userId === null || importState?.userId !== userId) {
      return { status: "loading" };
    }
    if (importState.status === "failed") return { status: "loadFailed" };
    if (importState.status === "running") return { status: "loading" };
    // 받아 둔 값이 있으면 재조회가 실패해도 그 값을 쓴다.
    if (accountBudget.data !== undefined) return { status: "ok", budget: accountBudget.data };
    return accountBudget.isError ? { status: "loadFailed" } : { status: "loading" };
  };
  const state = selectState();

  const save = async (budget: number | null): Promise<BudgetSaveResult> => {
    if (status === "loggedOut") {
      budgetStore.set(budget);
      return { ok: true };
    }
    if (state.status !== "ok") return NOT_READY;
    try {
      await saveBudget.mutateAsync(budget);
      return { ok: true };
    } catch (error) {
      if (!isUnauthorized(error)) return { ok: false, reason: "network" };
      onUnauthorized();
      return { ok: false, reason: "unauthorized" };
    }
  };

  return {
    state,
    save,
    retry: () => {
      if (userId === null) return;
      if (importState?.status === "failed") void runImport(userId);
      else void accountBudget.refetch();
    },
    isRetrying: importState?.status === "running" || accountBudget.isFetching,
  };
}
