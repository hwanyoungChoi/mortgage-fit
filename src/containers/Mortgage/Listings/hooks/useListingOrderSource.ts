import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useAccountListingOrder } from "@/hooks/useAccountListingOrder";
import { useImportListingOrder } from "@/hooks/useImportListingOrder";
import { useMe } from "@/hooks/useMe";
import { useSaveListingOrder } from "@/hooks/useSaveListingOrder";
import { ApiRequestError } from "@/lib/api/client";
import { householdRefetchInterval } from "@/lib/utils/household";

import type { ListingSourceStatus } from "@/lib/types/listing";
import type {
  ListingOrderImportStore,
  ListingOrderSaveFailure,
  ListingOrderSaveResult,
  ListingOrderState,
  ListingOrderStore,
} from "@/lib/types/listingOrder";

type ListingOrderSourceOptions = {
  /** 저장 목록과 같은 출처 상태를 따른다. */
  status: ListingSourceStatus;
  /** 로그아웃 상태의 원본. 로그인 중에는 이전 때 읽기만 한다. */
  listingOrderStore: ListingOrderStore;
  listingOrderImportStore: ListingOrderImportStore;
  /** 401일 때 목록과 같은 세션 만료 처리 */
  onUnauthorized: () => void;
};

export type ListingOrderSource = {
  state: ListingOrderState;
  save: (ids: string[]) => Promise<ListingOrderSaveResult>;
  /** 실패한 이전 또는 계정 순서 조회를 다시 한다 */
  retry: () => void;
  isRetrying: boolean;
};

/** 이 사용자의 첫 로그인 순서 이전. 화면에 들어올 때마다 기록을 보고 끝난 사용자는 건너뛴다. */
type OrderImportState = { userId: string; status: "running" | "done" | "failed" };

const NOT_READY: ListingOrderSaveFailure = { ok: false, reason: "notReady" };

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

/**
 * 직접 정렬 순서의 출처(ADR-026). 규칙은 예산(`useBudgetSource`)과 같다:
 * 로그아웃이면 기기 순서, 로그인이면 계정 순서다. 로그인 상태에서는 이 기기의 첫 이전
 * (기기 순서가 있으면 계정이 비어 있을 때만 채움)을 끝낸 뒤 조회하고,
 * 이전·조회 중이거나 실패하면 기기 순서로 대신 쓰지 않는다.
 */
export function useListingOrderSource({
  status,
  listingOrderStore,
  listingOrderImportStore,
  onUnauthorized,
}: ListingOrderSourceOptions): ListingOrderSource {
  const deviceOrder = useSyncExternalStore(
    listingOrderStore.subscribe,
    listingOrderStore.getSnapshot,
  );
  const me = useMe();
  const userId = status === "loggedIn" ? (me.data?.user?.id ?? null) : null;
  const [importState, setImportState] = useState<OrderImportState | null>(null);
  const isImportRunningRef = useRef(false);
  const { mutateAsync: sendImport } = useImportListingOrder();
  const saveListingOrder = useSaveListingOrder();
  const isImportDone =
    userId !== null && importState?.userId === userId && importState.status === "done";
  const accountOrder = useAccountListingOrder({
    enabled: isImportDone,
    refetchInterval: householdRefetchInterval(me.data),
  });

  const runImport = useCallback(
    async (targetUserId: string) => {
      if (isImportRunningRef.current) return;
      isImportRunningRef.current = true;
      setImportState({ userId: targetUserId, status: "running" });
      let nextStatus: OrderImportState["status"] = "done";
      if (!listingOrderImportStore.has(targetUserId)) {
        const ids = listingOrderStore.getSnapshot();
        try {
          // 응답(계정의 현재 값)은 훅이 캐시에 넣는다. 기기 순서가 없으면 올리지 않고 기록만 남긴다.
          if (ids !== null) await sendImport(ids);
          listingOrderImportStore.add(targetUserId);
        } catch (error) {
          if (isUnauthorized(error)) onUnauthorized();
          nextStatus = "failed";
        }
      }
      isImportRunningRef.current = false;
      setImportState({ userId: targetUserId, status: nextStatus });
    },
    [listingOrderImportStore, listingOrderStore, sendImport, onUnauthorized],
  );

  useEffect(() => {
    if (userId === null || importState?.userId === userId) return;
    void runImport(userId);
  }, [userId, importState, runImport]);

  // 창 포커스 재조회에서 세션이 끝난 것을 알게 되는 경우
  const isOrderUnauthorized = isUnauthorized(accountOrder.error);
  useEffect(() => {
    if (isOrderUnauthorized) onUnauthorized();
  }, [isOrderUnauthorized, onUnauthorized]);

  const selectState = (): ListingOrderState => {
    if (status === "loggedOut") return { status: "ok", ids: deviceOrder };
    if (status === "error") return { status: "accountError" };
    if (status === "loading" || userId === null || importState?.userId !== userId) {
      return { status: "loading" };
    }
    if (importState.status === "failed") return { status: "loadFailed" };
    if (importState.status === "running") return { status: "loading" };
    // 받아 둔 값이 있으면 재조회가 실패해도 그 값을 쓴다.
    if (accountOrder.data !== undefined) return { status: "ok", ids: accountOrder.data };
    return accountOrder.isError ? { status: "loadFailed" } : { status: "loading" };
  };
  const state = selectState();

  const save = async (ids: string[]): Promise<ListingOrderSaveResult> => {
    if (status === "loggedOut") {
      listingOrderStore.set(ids);
      return { ok: true };
    }
    if (state.status !== "ok") return NOT_READY;
    try {
      await saveListingOrder.mutateAsync(ids);
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
      else void accountOrder.refetch();
    },
    isRetrying: importState?.status === "running" || accountOrder.isFetching,
  };
}
