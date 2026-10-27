import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { ApiRequestError } from "@/lib/api/client";
import { selectAccountSourceStatus } from "@/lib/utils/accountSourceStatus";
import { createRandomId } from "@/lib/utils/createRandomId";
import { householdOf, householdRefetchInterval } from "@/lib/utils/household";
import { toListingFields } from "@/lib/utils/listingStore";

import { isAccountImportSettled, type AccountImport } from "./useAccountImport";
import { useCreateListing } from "./useCreateListing";
import { useDeleteListing } from "./useDeleteListing";
import { useEndSession } from "./useEndSession";
import { useImportListings } from "./useImportListings";
import { listingListQueryKey, useListingList } from "./useListingList";
import { useListings } from "./useListings";
import { useMe } from "./useMe";
import { useUpdateListing } from "./useUpdateListing";
import { useUpdateListingMemo } from "./useUpdateListingMemo";
import { useUpdateListingName } from "./useUpdateListingName";
import { useUpdateListingStatus } from "./useUpdateListingStatus";

import type { Household } from "@/lib/types/household";
import type {
  Listing,
  ListingInput,
  ListingListState,
  ListingSourceStatus,
  ListingSourceWriteFailure,
  ListingSourceWriteResult,
  ListingStatus,
  ListingStore,
  ListingWriteFailure,
  ListingWriteResult,
} from "@/lib/types/listing";
import type { SessionHintStore } from "@/lib/types/sessionHint";

type ListingSourceOptions = {
  /** 로그아웃 상태의 원본. 로그인 중에는 쓰지 않는다(AC-0). */
  listingStore: ListingStore;
  sessionHintStore: SessionHintStore;
  /** 로그인 직후 로컬 매물 이전. 끝나기 전에는 출처를 loading으로 두고 서버 목록을 조회하지 않는다. */
  accountImport: AccountImport;
};

export type ListingSource = {
  status: ListingSourceStatus;
  /** 함께 쓰는 목록에 있으면 그 요약(로그인 상태에서만), 아니면 null */
  household: Household | null;
  list: ListingListState;
  /** 받아 둔 서버 목록은 있는데 다시 조회하지 못했다(창 포커스 재조회 실패 등). 목록은 지우지 않는다. */
  isRefreshFailed: boolean;
  /** 이 화면에서 세션이 끝났다(401). 제목 아래 안내가 다시 로그인하라고 알린다. */
  isSessionExpired: boolean;
  /** 서버 쓰기·조회가 401일 때 로그아웃 상태로 바꾸고 제목 아래 안내가 알리게 한다(예산 줄도 같이 쓴다). */
  expireSession: () => void;
  /** 계정 확인(error) 또는 서버 목록 조회를 다시 한다 */
  retry: () => void;
  isRetrying: boolean;
  add: (input: ListingInput) => Promise<ListingSourceWriteResult>;
  /** 공유받기: 새 id·현재 시각의 사본으로 넣는다. `count`는 실제로 들어간 수 */
  addMany: (
    inputs: ListingInput[],
  ) => Promise<{ ok: true; count: number } | ListingSourceWriteFailure>;
  /** 계산 화면 덮어쓰기. 메모는 그대로 둔다. */
  update: (id: string, input: ListingInput) => Promise<ListingSourceWriteResult>;
  /** 빈 문자열이면 메모를 지운다. */
  updateMemo: (listing: Listing, memo: string) => Promise<ListingSourceWriteResult>;
  /** 이름만 바꾼다(검증된 1~40자). 다른 필드는 그대로 둔다. */
  updateName: (listing: Listing, name: string) => Promise<ListingSourceWriteResult>;
  /** 상태만 바꾼다. null이면 지운다(미지정). 다른 필드는 그대로 둔다. */
  updateStatus: (
    listing: Listing,
    status: ListingStatus | null,
  ) => Promise<ListingSourceWriteResult>;
  remove: (id: string) => Promise<ListingSourceWriteResult>;
};

const NOT_READY: ListingSourceWriteFailure = { ok: false, reason: "notReady" };

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

/**
 * 추가(POST·import)의 400은 계정 500개 상한이다. 필드는 클라이언트가 같은 규칙으로 먼저 검증한다.
 * 404는 함께 쓰는 중이면 상대가 지웠을 수도 있어 사유를 나눈다(혼자면 기존 사유 그대로).
 */
function toWriteFailure(
  error: unknown,
  isCreate: boolean,
  isInHousehold: boolean,
): ListingSourceWriteFailure {
  if (!(error instanceof ApiRequestError)) return { ok: false, reason: "network" };
  if (error.status === 401) return { ok: false, reason: "unauthorized" };
  if (error.status === 404) {
    return { ok: false, reason: isInHousehold ? "deletedInHousehold" : "deletedElsewhere" };
  }
  if (error.status === 400 && isCreate) return { ok: false, reason: "limit" };
  return { ok: false, reason: "network" };
}

function fromLocal(result: { ok: true } | ListingWriteFailure): ListingSourceWriteResult {
  return result.ok ? { ok: true } : result;
}

/**
 * 저장 목록의 출처(로컬 스토어 / 서버)를 하나로 묶는다. 쓰기는 두 출처 모두 Promise 결과다.
 * 출처가 정해지기 전(loading·error)에는 쓰지 않고 `notReady`로 실패한다(로컬로 몰래 쓰지 않는다).
 */
export function useListingSource({
  listingStore,
  sessionHintStore,
  accountImport,
}: ListingSourceOptions): ListingSource {
  const queryClient = useQueryClient();
  const localSnapshot = useListings(listingStore);
  const me = useMe();
  const status = selectAccountSourceStatus({
    me: me.data,
    isMeError: me.isError,
    hasSessionHint: sessionHintStore.has(),
    isImportSettled: (userId) => isAccountImportSettled(accountImport.state, userId),
  });
  const household = status === "loggedIn" ? householdOf(me.data) : null;
  const serverList = useListingList({
    enabled: status === "loggedIn",
    refetchInterval: householdRefetchInterval(me.data),
  });
  const endSession = useEndSession(sessionHintStore);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const createListing = useCreateListing();
  const updateListing = useUpdateListing();
  const updateListingMemo = useUpdateListingMemo();
  const updateListingName = useUpdateListingName();
  const updateListingStatus = useUpdateListingStatus();
  const deleteListing = useDeleteListing();
  const importListings = useImportListings();

  useEffect(() => {
    if (me.data === undefined) return;
    if (me.data.user === null) sessionHintStore.clear();
    else sessionHintStore.mark();
  }, [me.data, sessionHintStore]);

  const expireSession = useCallback(() => {
    setIsSessionExpired(true);
    endSession();
  }, [endSession]);

  // 창 포커스 재조회에서 세션이 끝난 것을 알게 되는 경우
  const isListUnauthorized = isUnauthorized(serverList.error);
  useEffect(() => {
    if (isListUnauthorized) expireSession();
  }, [isListUnauthorized, expireSession]);

  const selectList = (): ListingListState => {
    if (status === "loading") return { status: "loading" };
    if (status === "error") return { status: "accountError" };
    if (status === "loggedOut") return localSnapshot;
    if (serverList.data !== undefined) return { status: "ok", listings: serverList.data };
    return serverList.isError ? { status: "loadFailed" } : { status: "loading" };
  };

  /** 서버 쓰기. 401이면 로그아웃 상태로, 404면 목록을 다시 받아 사라진 매물을 걷는다. */
  const writeServer = async (
    write: () => Promise<unknown>,
    isCreate = false,
  ): Promise<ListingSourceWriteResult> => {
    try {
      await write();
      return { ok: true };
    } catch (error) {
      const failure = toWriteFailure(error, isCreate, household !== null);
      if (failure.reason === "unauthorized") expireSession();
      if (failure.reason === "deletedElsewhere" || failure.reason === "deletedInHousehold") {
        void queryClient.invalidateQueries({ queryKey: listingListQueryKey() });
      }
      return failure;
    }
  };

  const writeBySource = (
    local: () => ListingWriteResult,
    server: () => Promise<ListingSourceWriteResult>,
  ): Promise<ListingSourceWriteResult> => {
    if (status === "loggedOut") return Promise.resolve(fromLocal(local()));
    if (status === "loggedIn") return server();
    return Promise.resolve(NOT_READY);
  };

  const addMany: ListingSource["addMany"] = async (inputs) => {
    if (status === "loggedOut") {
      const result = listingStore.addMany(inputs);
      return result.ok ? { ok: true, count: result.listings.length } : result;
    }
    if (status !== "loggedIn") return NOT_READY;
    const timestamp = new Date().toISOString();
    const listings: Listing[] = inputs.map((input) => ({
      id: createRandomId(),
      ...toListingFields(input),
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    let imported = 0;
    const result = await writeServer(async () => {
      imported = (await importListings.mutateAsync(listings)).imported;
    }, true);
    return result.ok ? { ok: true, count: imported } : result;
  };

  const isRetrying = me.isFetching || serverList.isFetching;

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
    isRetrying,
    add: (input) =>
      writeBySource(
        () => listingStore.add(input),
        () => writeServer(() => createListing.mutateAsync(toListingFields(input)), true),
      ),
    addMany,
    update: (id, input) =>
      writeBySource(
        () => listingStore.update(id, input),
        () => writeServer(() => updateListing.mutateAsync({ id, listing: toListingFields(input) })),
      ),
    updateMemo: (listing, memo) =>
      writeBySource(
        () => listingStore.update(listing.id, { ...listing, memo }),
        () => writeServer(() => updateListingMemo.mutateAsync({ id: listing.id, memo })),
      ),
    updateName: (listing, name) =>
      writeBySource(
        // memo·status 키는 매물 값 그대로 넘기거나(있으면) 넘기지 않아(없으면) 스토어가 기존 값을 잇는다.
        () => listingStore.update(listing.id, { ...listing, name }),
        () => writeServer(() => updateListingName.mutateAsync({ id: listing.id, name })),
      ),
    updateStatus: (listing, status) =>
      writeBySource(
        // status 키를 넘겨야 스토어가 기존 상태를 잇지 않고 바꾼다(undefined면 지움).
        () => listingStore.update(listing.id, { ...listing, status: status ?? undefined }),
        () => writeServer(() => updateListingStatus.mutateAsync({ id: listing.id, status })),
      ),
    remove: (id) =>
      writeBySource(
        () => listingStore.remove(id),
        () => writeServer(() => deleteListing.mutateAsync(id)),
      ),
  };
}
