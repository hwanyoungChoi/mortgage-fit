import type { ExtraCost } from "./extraCost";
import type { Borrower, Region } from "./regulation";
import type { StorageWriteResult } from "./storage";

/** 매물 상태(ADR-027). candidate 후보 · hold 보류 · rejected 비후보. 라벨은 `constants/listingStatus.ts` */
export type ListingStatus = "candidate" | "hold" | "rejected";

export type Listing = {
  id: string;
  name: string;
  salePrice: number;
  kbPrice: number;
  region: Region;
  borrower: Borrower;
  /** 0~100 정수. 키가 없으면 규제 LTV다. 규제로 저장할 때는 키를 쓰지 않는다(ADR-012). */
  customLtvRate?: number;
  /** 전용 85㎡ 초과일 때만 키를 쓴다. 키 없음 = 85㎡ 이하(ADR-022, ADR-012 규칙). */
  isAreaOver85?: true;
  /** 1~5,000자(코드포인트). 메모가 없으면 키를 쓰지 않는다(ADR-012 규칙). */
  memo?: string;
  /** 1~30줄. 없으면 키를 쓰지 않는다(ADR-012 규칙, 빈 배열도 저장하지 않음). 순서 = 입력 순서(ADR-024) */
  extraCosts?: ExtraCost[];
  /** 없으면 미지정이고 키를 쓰지 않는다(ADR-027, ADR-012 규칙). 덮어쓰기(PUT·로컬 update)는 메모처럼 기존 상태를 둔다. */
  status?: ListingStatus;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
};

/** add/update에 넘기는 값. id와 시각은 스토어가 채운다. */
export type ListingInput = Pick<
  Listing,
  | "name"
  | "salePrice"
  | "kbPrice"
  | "region"
  | "borrower"
  | "customLtvRate"
  | "isAreaOver85"
  | "extraCosts"
  | "status"
> & {
  /** 키가 있으면 메모를 이 값으로 바꾸고(빈 문자열이면 지움), 키가 없으면 덮어쓰기에서도 기존 메모를 둔다. */
  memo?: string;
};

export type LoadListingsResult =
  | { ok: true; listings: Listing[] }
  | { ok: false; reason: "corrupt"; rawText: string }
  | { ok: false; reason: "unavailable" };

export type ListingSnapshot =
  | { status: "ok"; listings: Listing[] }
  | { status: "corrupt"; rawText: string }
  | { status: "unavailable" };

export type ListingWriteFailure = { ok: false; reason: "corrupt" | "unavailable" | "notFound" };

export type ListingWriteResult = { ok: true } | ListingWriteFailure;

/**
 * 저장 목록의 출처(ADR-023). loading: `/api/me` 응답 전, loggedOut: 로컬 스토어, loggedIn: 서버,
 * error: 로그인했던 브라우저에서 `/api/me`가 실패(쓰기를 막고 로컬로 돌리지 않는다).
 */
export type ListingSourceStatus = "loading" | "loggedOut" | "loggedIn" | "error";

/**
 * 화면이 그리는 목록. 로컬 스냅샷 3값에 더해 출처가 정해지기 전(loading), 계정 확인 실패(accountError),
 * 서버 목록 첫 조회 실패(loadFailed)가 있다.
 */
export type ListingListState =
  ListingSnapshot | { status: "loading" } | { status: "accountError" } | { status: "loadFailed" };

/**
 * 출처를 거친 쓰기의 실패. 로컬 사유에 더해
 * notReady: 출처가 아직 정해지지 않음(loading·error), unauthorized: 세션 만료(401),
 * deletedElsewhere: 다른 기기에서 삭제됨(404), deletedInHousehold: 함께 쓰는 중에 404(상대나 다른 기기에서 삭제됨),
 * limit: 계정 매물 상한(500개), network: 연결·서버 오류.
 */
export type ListingSourceWriteFailure = {
  ok: false;
  reason:
    | ListingWriteFailure["reason"]
    | "notReady"
    | "unauthorized"
    | "deletedElsewhere"
    | "deletedInHousehold"
    | "limit"
    | "network";
};

export type ListingSourceWriteResult = { ok: true } | ListingSourceWriteFailure;

export type ListingStore = {
  getSnapshot: () => ListingSnapshot;
  subscribe: (listener: () => void) => () => void;
  /** 다른 탭의 `storage` 이벤트처럼 외부에서 바뀌었을 때 구독자에게 알린다. */
  notify: () => void;
  add: (input: ListingInput) => { ok: true; listing: Listing } | ListingWriteFailure;
  /** 여러 개를 새 id로 한 번에 추가한다(공유받기). 전부 들어가거나 하나도 안 들어간다. */
  addMany: (inputs: ListingInput[]) => { ok: true; listings: Listing[] } | ListingWriteFailure;
  update: (id: string, input: ListingInput) => ListingWriteResult;
  remove: (id: string) => ListingWriteResult;
  reset: () => StorageWriteResult;
};
