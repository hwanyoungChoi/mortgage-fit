import { useCallback, useEffect, useRef, useState } from "react";

import { ApiRequestError } from "@/lib/api/client";
import { householdOf } from "@/lib/utils/household";
import { toListingFields } from "@/lib/utils/listingStore";

import { useImportListings } from "./useImportListings";
import { useMe } from "./useMe";

import type { ImportListingsResponse } from "@/lib/types/account";
import type {
  AccountImportFailureReason,
  AccountImportResult,
  AccountImportState,
  AccountImportStore,
} from "@/lib/types/accountImport";
import type { Listing, ListingSnapshot, ListingStore } from "@/lib/types/listing";

/**
 * `/api/listings/import` 한 요청을 개수가 아니라 직렬화한 바이트로 나눈다(서버 계약: 1~100개, 본문 512KB = 524,288바이트).
 * 매물 하나(import 항목)는 최악 37,618바이트다: 메모 5,000자·이름 40자·추가 비용 30줄 × 이름 30자를 모두 6바이트
 * (짝 없는 서로게이트 → `\uXXXX`)로, id 64자·시각 포함. 한글(3바이트)만이면 19,798바이트.
 * 최악이면 13개(489,061바이트)까지만 들어가고 14개(526,680바이트)는 413이라 고정 개수로는 나눌 수 없다. 그래서 보낼 본문을
 * 그대로 재서 400KB(409,600바이트)를 넘기 전에 끊는다(최악 10개 = 376,204바이트). 재는 값은 보내는 본문과 같지만 상한 바로
 * 밑까지 채우지 않고 약 112KB를 남긴다. 최악 항목 하나(약 37KB)는 400KB보다 훨씬 작아 혼자서도 항상 한 요청에 들어간다.
 * 짧은 매물(보통 230바이트 안팎)은 서버 개수 상한(`server/listings/parseListingRequests.ts`의 100)에서 끊는다.
 * 메모·이름·추가 비용 상한을 올리면 위 최악값을 다시 계산한다(ADR-024 D4).
 */
const IMPORT_MAX_LISTINGS = 100;
const IMPORT_MAX_BODY_BYTES = 400 * 1024;

const textEncoder = new TextEncoder();
/** `apiClient`가 보내는 본문과 같은 직렬화(JSON.stringify, UTF-8)의 바이트 수 */
const jsonByteLength = (value: unknown) => textEncoder.encode(JSON.stringify(value)).byteLength;
const IMPORT_ENVELOPE_BYTES = jsonByteLength({ listings: [] });

export type AccountImport = {
  /** 아직 이 사용자의 이전을 시작하지 않았으면 null */
  state: AccountImportState | null;
  /** 실패한 이전을 다시 한다. 이미 옮긴 id는 기록에 있어 보내지 않는다. */
  retry: () => void;
};

/**
 * 이 사용자의 이전이 끝났거나 건너뛰기로 정해졌다(함께 쓰는 중 건너뜀 포함). 그 전까지 서버 목록을 조회하지 않는다(빈 목록 깜빡임 방지).
 */
export function isAccountImportSettled(state: AccountImportState | null, userId: string): boolean {
  return state !== null && state.userId === userId && state.status !== "running";
}

/** 400은 계정 500개 상한이다(필드는 로컬 저장소가 같은 검증 함수로 이미 본 값). 나머지는 연결·서버 오류. */
function toFailureReason(error: unknown): AccountImportFailureReason {
  return error instanceof ApiRequestError && error.status === 400 ? "limit" : "network";
}

/** 본문이 `IMPORT_MAX_BODY_BYTES`, 개수가 `IMPORT_MAX_LISTINGS`를 넘기 전에 끊는다. 항목마다 배열 쉼표 1바이트를 더해 센다. */
function toBatches(listings: Listing[]): Listing[][] {
  const batches: Listing[][] = [];
  let batch: Listing[] = [];
  let batchBytes = IMPORT_ENVELOPE_BYTES;
  for (const listing of listings) {
    const listingBytes = jsonByteLength(listing) + 1;
    const isFull =
      batch.length === IMPORT_MAX_LISTINGS || batchBytes + listingBytes > IMPORT_MAX_BODY_BYTES;
    if (batch.length > 0 && isFull) {
      batches.push(batch);
      batch = [];
      batchBytes = IMPORT_ENVELOPE_BYTES;
    }
    batch.push(listing);
    batchBytes += listingBytes;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

type ImportLocalListingsOptions = {
  userId: string;
  /** 함께 쓰는 중이면 보내지도 기록하지도 않는다(기기 매물이 함께 쓰는 목록으로 올라가지 않게, ADR-029). */
  isInHousehold: boolean;
  snapshot: ListingSnapshot;
  accountImportStore: AccountImportStore;
  send: (listings: Listing[]) => Promise<ImportListingsResponse>;
  confirm: (message: string) => boolean;
};

/**
 * 이 기기의 로컬 매물 중 이 계정으로 아직 옮기지 않은 것을 본문 크기 단위로 나눠 보낸다(`toBatches`).
 * 로컬 목록은 읽기만 한다(AC-0). 요청이 성공할 때마다 그 id를 기록해, 서버에서 지운 매물이 다시 로그인할 때 되살아나지 않는다.
 * 이 기기에 다른 계정의 기록이 있고 이 계정은 처음이면 한 번 묻는다(한 기기를 둘이 쓰는 경우, 스펙 U6).
 */
async function importLocalListings({
  userId,
  isInHousehold,
  snapshot,
  accountImportStore,
  send,
  confirm,
}: ImportLocalListingsOptions): Promise<AccountImportResult> {
  if (isInHousehold) return { status: "skipped", reason: "household" };
  if (snapshot.status !== "ok") return { status: "skipped", reason: snapshot.status };
  const imports = accountImportStore.read();
  const importedIds = new Set(imports[userId] ?? []);
  const pending = snapshot.listings.filter((listing) => !importedIds.has(listing.id));
  if (pending.length === 0) return { status: "done", importedCount: 0 };

  const hasOtherAccount = Object.keys(imports).some((id) => id !== userId);
  if (hasOtherAccount && !Object.hasOwn(imports, userId)) {
    const pendingIds = pending.map((listing) => listing.id);
    if (!confirm(`이 기기의 매물 ${pending.length}개를 내 계정으로 옮길까요?`)) {
      // 옮기지 않기로 한 매물도 기록해 다시 묻지 않는다(영구 제외, 스펙 A15).
      accountImportStore.add(userId, pendingIds);
      return { status: "done", importedCount: 0 };
    }
    // 기록 키를 먼저 만들어, 이번에 실패해 다시 시도할 때 또 묻지 않는다.
    accountImportStore.add(userId, []);
  }

  let importedCount = 0;
  let sentCount = 0;
  // 실제로 보낼 모양(알려진 필드만)으로 바꾼 뒤 재야 본문 크기와 맞는다.
  const importItems = pending.map(({ id, createdAt, updatedAt, ...fields }) => ({
    id,
    ...toListingFields(fields),
    createdAt,
    updatedAt,
  }));
  for (const batch of toBatches(importItems)) {
    try {
      const response = await send(batch);
      importedCount += response.imported;
    } catch (error) {
      return {
        status: "failed",
        reason: toFailureReason(error),
        failedCount: pending.length - sentCount,
      };
    }
    sentCount += batch.length;
    accountImportStore.add(
      userId,
      batch.map((listing) => listing.id),
    );
  }
  return { status: "done", importedCount };
}

/** 함께 쓰는 중이라 건너뛴 사용자가 나갔다(같은 세션에서 household가 null로 바뀜). 이때 한 번 다시 한다. */
function shouldRunAfterLeave(state: AccountImportState, isInHousehold: boolean): boolean {
  return state.status === "skipped" && state.reason === "household" && !isInHousehold;
}

type AccountImportOptions = {
  /** 로그아웃 상태의 목록 원본. 읽기만 한다. */
  listingStore: ListingStore;
  accountImportStore: AccountImportStore;
  /** 실제로 옮긴 매물이 있을 때 한 번 부른다. 바뀌지 않는 함수를 넘긴다(useCallback). */
  onImported: (importedCount: number) => void;
};

/**
 * 로그인 확인 직후 이 기기의 로컬 매물을 계정으로 옮긴다. 앱에서 한 번만 부른다(`AppRoutes`).
 * 화면을 오가도 결과가 남고, 실행 중에는 다시 시작하지 않는다. 함께 쓰는 중이면 건너뛰고, 나가면 그때 한 번 한다.
 */
export function useAccountImport({
  listingStore,
  accountImportStore,
  onImported,
}: AccountImportOptions): AccountImport {
  const me = useMe();
  const userId = me.data?.user?.id ?? null;
  const { mutateAsync: sendImport } = useImportListings();
  const isInHousehold = householdOf(me.data) !== null;
  const [state, setState] = useState<AccountImportState | null>(null);
  const isRunningRef = useRef(false);

  const run = useCallback(
    async (targetUserId: string, isTargetInHousehold: boolean) => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      setState({ userId: targetUserId, status: "running" });
      const result = await importLocalListings({
        userId: targetUserId,
        isInHousehold: isTargetInHousehold,
        snapshot: listingStore.getSnapshot(),
        accountImportStore,
        send: sendImport,
        confirm: (message) => window.confirm(message),
      });
      isRunningRef.current = false;
      setState({ userId: targetUserId, ...result });
      if (result.status === "done" && result.importedCount > 0) {
        onImported(result.importedCount);
      }
    },
    [listingStore, accountImportStore, sendImport, onImported],
  );

  useEffect(() => {
    if (userId === null) return;
    if (state?.userId === userId && !shouldRunAfterLeave(state, isInHousehold)) return;
    void run(userId, isInHousehold);
  }, [userId, isInHousehold, state, run]);

  return {
    state,
    retry: () => {
      if (userId !== null) void run(userId, isInHousehold);
    },
  };
}
