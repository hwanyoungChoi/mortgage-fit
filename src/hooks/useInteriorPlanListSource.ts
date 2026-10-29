import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { ApiRequestError } from "@/lib/api/client";
import { selectAccountSourceStatus } from "@/lib/utils/accountSourceStatus";
import { householdOf, householdRefetchInterval } from "@/lib/utils/household";
import { INTERIOR_PLANS_STORAGE_KEY } from "@/lib/utils/interiorPlanStorage";

import { useEndSession } from "./useEndSession";
import { isInteriorPlanImportSettled, type InteriorPlanImport } from "./useInteriorPlanImport";
import { useInteriorPlanList } from "./useInteriorPlanList";
import { useMe } from "./useMe";

import type { AccountSourceStatus } from "@/lib/types/account";
import type { Household } from "@/lib/types/household";
import type { InteriorPlanListState, InteriorPlanStore } from "@/lib/types/interiorPlanStore";
import type { SessionHintStore } from "@/lib/types/sessionHint";

type InteriorPlanListSourceOptions = {
  /** 로그아웃 상태의 원본. 여기서는 읽기만 한다(AC-0). */
  store: InteriorPlanStore;
  /** 읽기만 한다(로그인했던 브라우저인지). 401일 때만 세션 종료로 지운다. */
  sessionHintStore: SessionHintStore;
  /** 로그인 직후 이 기기 계획의 이전. 끝나기 전에는 출처를 loading으로 두고 서버 계획을 조회하지 않는다. */
  planImport: InteriorPlanImport;
};

/** 계획 출처의 읽기 부분. 쓰기를 갖지 않는다(ADR-031 D5 B). */
export type InteriorPlanListSource = {
  status: AccountSourceStatus;
  /** 함께 쓰는 중이면 그 요약(로그인 상태에서만), 아니면 null */
  household: Household | null;
  list: InteriorPlanListState;
  /** 받아 둔 서버 계획은 있는데 다시 조회하지 못했다(창 포커스·주기 재조회 실패). 목록은 지우지 않는다. */
  isRefreshFailed: boolean;
  /** 세션이 끝났다(401). 화면 위 안내가 다시 로그인하라고 알린다. */
  isSessionExpired: boolean;
  /** 서버 쓰기·조회가 401일 때 로그아웃 상태로 바꾼다(쓰기 쪽도 같이 쓴다). */
  expireSession: () => void;
  /** 계정 확인(error) 또는 서버 계획 조회를 다시 한다 */
  retry: () => void;
  isRetrying: boolean;
};

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

/**
 * 인테리어 계획 목록의 출처(로그아웃: 로컬 스토어 / 로그인: 서버). [인테리어]과 홈이 같이 쓴다.
 * 저장소에는 쓰지 않는다. 세션 종료(401)만 `session-hint`를 지운다(기존 예외).
 */
export function useInteriorPlanListSource({
  store,
  sessionHintStore,
  planImport,
}: InteriorPlanListSourceOptions): InteriorPlanListSource {
  const me = useMe();
  const status = selectAccountSourceStatus({
    me: me.data,
    isMeError: me.isError,
    hasSessionHint: sessionHintStore.has(),
    isImportSettled: (userId) => isInteriorPlanImportSettled(planImport.state, userId),
  });
  const household = status === "loggedIn" ? householdOf(me.data) : null;
  const serverList = useInteriorPlanList({
    enabled: status === "loggedIn",
    refetchInterval: householdRefetchInterval(me.data),
  });
  const endSession = useEndSession(sessionHintStore);
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      // key가 null이면 다른 탭에서 storage.clear()를 부른 경우다.
      if (event.key === INTERIOR_PLANS_STORAGE_KEY || event.key === null) store.notify();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [store]);

  const localSnapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const expireSession = useCallback(() => {
    setIsSessionExpired(true);
    endSession();
  }, [endSession]);

  // 창 포커스·주기 재조회에서 세션이 끝난 것을 알게 되는 경우
  const isListUnauthorized = isUnauthorized(serverList.error);
  useEffect(() => {
    if (isListUnauthorized) expireSession();
  }, [isListUnauthorized, expireSession]);

  const selectList = (): InteriorPlanListState => {
    if (status === "loading") return { status: "loading" };
    if (status === "error") return { status: "accountError" };
    if (status === "loggedOut") return localSnapshot;
    if (serverList.data !== undefined) return { status: "ok", plans: serverList.data };
    return serverList.isError ? { status: "loadFailed" } : { status: "loading" };
  };

  return {
    status,
    household,
    list: selectList(),
    isRefreshFailed: status === "loggedIn" && serverList.isError && serverList.data !== undefined,
    isSessionExpired: isSessionExpired && status === "loggedOut",
    expireSession,
    retry: () => {
      if (status === "error") void me.refetch();
      else if (status === "loggedIn") void serverList.refetch();
    },
    isRetrying: me.isFetching || serverList.isFetching,
  };
}
