import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useListingSource } from "@/hooks/useListingSource";
import { useOpenSheet } from "@/hooks/useOpenSheet";
import { PATHS } from "@/lib/constants/paths";
import { accountImportProblem } from "@/lib/utils/accountImportProblem";
import { calculateLoan } from "@/lib/utils/calculateLoan";
import { copiedListingName, listingToCopyDraft, listingToDraft } from "@/lib/utils/listingDraft";
import { sortListings } from "@/lib/utils/sortListings";

import styles from "./MortgageListings.module.css";
import { budgetExcess } from "./budgetExcess";
import BudgetBar from "./components/BudgetBar";
import CompactListingList from "./components/CompactListingList";
import CorruptListingsNotice from "./components/CorruptListingsNotice";
import HeaderNotices from "./components/HeaderNotices";
import { type ListingStatusFailure } from "./components/ListingCard";
import ListingStatusSheet from "./components/ListingStatusSheet";
import ShareSheet, { type ShareTarget } from "./components/ShareSheet";
import { useBudgetSource } from "./hooks/useBudgetSource";
import { useListingOrderSource } from "./hooks/useListingOrderSource";
import { useListingsScrollRestoration } from "./hooks/useListingsScrollRestoration";

import type { AccountImport } from "@/hooks/useAccountImport";
import type { BudgetImportStore, BudgetStore } from "@/lib/types/budget";
import type { DraftStore } from "@/lib/types/draft";
import type {
  Listing,
  ListingSourceWriteFailure,
  ListingStatus,
  ListingStore,
} from "@/lib/types/listing";
import type {
  ListingOrderImportStore,
  ListingOrderSaveFailure,
  ListingOrderStore,
} from "@/lib/types/listingOrder";
import type { PrivacyModeStore } from "@/lib/types/privacyMode";
import type { Regulations } from "@/lib/types/regulation";
import type { SentShareStore } from "@/lib/types/sentShare";
import type { SessionHintStore } from "@/lib/types/sessionHint";

type MortgageListingsProps = {
  /** 로그아웃 상태의 목록 원본 */
  listingStore: ListingStore;
  sessionHintStore: SessionHintStore;
  /** 로그인 직후 이 기기 매물의 이전. 옮기지 못했으면 목록 위에 이유와 [다시 시도]를 보인다. */
  accountImport: AccountImport;
  draftStore: DraftStore;
  /** 로그아웃 상태의 예산 원본. 로그인 중에는 첫 이전 때 읽기만 한다. */
  budgetStore: BudgetStore;
  budgetImportStore: BudgetImportStore;
  /** 로그아웃 상태의 직접 정렬 순서 원본. 로그인 중에는 첫 이전 때 읽기만 한다. */
  listingOrderStore: ListingOrderStore;
  listingOrderImportStore: ListingOrderImportStore;
  sentShareStore: SentShareStore;
  /** 가리기 모드(이 기기). 켜면 금액과 메모를 가린다. */
  privacyModeStore: PrivacyModeStore;
  regulations: Regulations;
  /** 저장 시트 이름 제안을 바꾼다. 복사는 "원래 이름 (복사)", 열기는 비운다. */
  onSuggestedNameChange: (name: string) => void;
  /** 다른 화면이나 이전이 남긴 알림(공유받은 매물 추가, 계정으로 옮김). 한 번만 보인다. */
  notice: string | null;
  onNoticeChange: (notice: string | null) => void;
};

/** 함께 쓰는 중 404. 목록을 다시 받아 카드가 사라지므로 카드 안이 아니라 목록 위에 남긴다(AC-5). */
const DELETED_IN_HOUSEHOLD_MESSAGE = "함께 쓰는 사람이나 다른 기기에서 삭제된 매물입니다";

/**
 * notFound는 다른 탭에서 이미 지운 경우라 목록이 그대로 맞으므로 알리지 않는다.
 * unauthorized는 제목 아래 안내가 "로그인이 끝났습니다"로 알린다. 상한(limit)은 삭제에서 생기지 않는다.
 */
const DELETE_FAILURE_MESSAGES: Record<ListingSourceWriteFailure["reason"], string | null> = {
  unavailable: "삭제하지 못했습니다. 이 브라우저에서 저장소를 사용할 수 없습니다",
  corrupt: "저장된 목록이 손상되어 삭제할 수 없습니다",
  notFound: null,
  notReady: "계정 상태를 확인한 뒤 다시 시도해 주세요",
  unauthorized: null,
  deletedElsewhere: "다른 기기에서 삭제된 매물입니다",
  deletedInHousehold: DELETED_IN_HOUSEHOLD_MESSAGE,
  limit: "삭제하지 못했습니다. 다시 시도해 주세요",
  network: "삭제하지 못했습니다. 연결을 확인하고 다시 시도해 주세요",
};

/** 순서 저장 실패는 원래 순서로 되돌린 뒤 알린다. unauthorized는 제목 아래 안내가 알린다. */
const ORDER_FAILURE_MESSAGES: Record<ListingOrderSaveFailure["reason"], string | null> = {
  notReady: "계정 상태를 확인한 뒤 다시 시도해 주세요",
  unauthorized: null,
  network: "순서를 저장하지 못해 원래 순서로 되돌렸습니다. 연결을 확인하고 다시 시도해 주세요",
};

/**
 * 상태를 바꾸지 못하면 그대로 두고(서버는 먼저 보인 칩을 되돌린다) 그 카드에 한 줄로 알린다.
 * notFound는 다른 탭에서 지운 경우라 알리지 않는다. unauthorized는 제목 아래 안내가 알린다.
 */
const STATUS_FAILURE_MESSAGES: Record<ListingSourceWriteFailure["reason"], string | null> = {
  unavailable: "상태를 바꾸지 못했습니다. 이 브라우저에서 저장소를 사용할 수 없습니다",
  corrupt: "저장된 목록이 손상되어 상태를 바꿀 수 없습니다",
  notFound: null,
  notReady: "계정 상태를 확인한 뒤 다시 시도해 주세요",
  unauthorized: null,
  deletedElsewhere: "다른 기기에서 삭제된 매물입니다",
  deletedInHousehold: DELETED_IN_HOUSEHOLD_MESSAGE,
  limit: "상태를 바꾸지 못했습니다. 다시 시도해 주세요",
  network: "상태를 바꾸지 못했습니다. 연결을 확인하고 다시 시도해 주세요",
};

/** 저장 목록 화면의 시트(한 번에 하나, ADR-017): 공유 링크, 상태 고르기 */
type ListingsSheet = { name: "share"; target: ShareTarget } | { name: "status"; listing: Listing };

const UNAVAILABLE_MESSAGE = "이 브라우저에서는 저장소를 사용할 수 없어 저장 목록을 쓸 수 없습니다";

/**
 * 저장 매물 목록. 결과는 저장하지 않고 현재 규제로 다시 계산해 보여준다(ADR-007).
 * 한 줄씩(이름과 필요한 자기자금) 보이고 줄을 누르면 상세 카드를 펼친다. 순서는 직접 정한 순서 하나다(ADR-026).
 */
function MortgageListings({
  listingStore,
  sessionHintStore,
  accountImport,
  draftStore,
  budgetStore,
  budgetImportStore,
  listingOrderStore,
  listingOrderImportStore,
  sentShareStore,
  privacyModeStore,
  regulations,
  onSuggestedNameChange,
  notice,
  onNoticeChange,
}: MortgageListingsProps) {
  const source = useListingSource({ listingStore, sessionHintStore, accountImport });
  const { list } = source;
  const budgetSource = useBudgetSource({
    status: source.status,
    budgetStore,
    budgetImportStore,
    onUnauthorized: source.expireSession,
  });
  // 예산을 불러오는 중이거나 실패하면 예산 초과를 표시하지 않는다(기기 예산으로 대신 계산하지 않음).
  const budget = budgetSource.state.status === "ok" ? budgetSource.state.budget : null;
  const orderSource = useListingOrderSource({
    status: source.status,
    listingOrderStore,
    listingOrderImportStore,
    onUnauthorized: source.expireSession,
  });
  // 끌어 놓은 순서. 저장이 끝날 때까지 이 순서로 보인다(되돌아가 깜빡이지 않게).
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [statusFailure, setStatusFailure] = useState<ListingStatusFailure | null>(null);
  // 끄는 손이 있는 목록 바로 위에 보인다(목록 위쪽 알림은 스크롤해 내려와 있으면 보이지 않는다).
  const [orderError, setOrderError] = useState<string | null>(null);
  const isPrivacyMode = useSyncExternalStore(
    privacyModeStore.subscribe,
    privacyModeStore.getSnapshot,
  );
  // 가리기 모드에서 잠깐 보이는 카드 하나. 목록을 떠나거나 가리기를 다시 누르면 다시 가린다.
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const sheet = useOpenSheet<ListingsSheet>();
  const shareListButtonRef = useRef<HTMLButtonElement>(null);
  // 알림은 잡아 둔 뒤 위에서 비운다. 다른 화면을 거쳐 돌아와도 다시 뜨지 않는다.
  // 목록을 보는 중에 도착한 알림(이전 완료)도 잡는다.
  const [shownNotice, setShownNotice] = useState(notice);
  useListingsScrollRestoration();

  useEffect(() => {
    if (notice === null) return;
    setShownNotice(notice);
    onNoticeChange(null);
  }, [notice, onNoticeChange]);

  // 로그인 상태일 때만 보인다(로그아웃하면 로컬 목록이 원본이라 옮기지 못한 것이 없다).
  const importProblem =
    source.status === "loggedIn" ? accountImportProblem(accountImport.state) : null;
  const savedOrder = orderSource.state.status === "ok" ? orderSource.state.ids : null;
  const sortedListings =
    list.status === "ok" ? sortListings(list.listings, pendingOrder ?? savedOrder) : [];
  // 계정 순서를 아직 못 받았으면 다른 순서로 대신 보이지 않는다.
  const isOrderMissing = pendingOrder === null && orderSource.state.status !== "ok";
  const canReorder = orderSource.state.status === "ok" && pendingOrder === null;

  /** 끌어 놓은 순서를 저장한다. 저장하지 못하면 원래 순서로 되돌리고 한 줄로 알린다. */
  const handleReorder = async (ids: string[]) => {
    setPendingOrder(ids);
    const result = await orderSource.save(ids);
    setOrderError(result.ok ? null : ORDER_FAILURE_MESSAGES[result.reason]);
    // 저장에 성공하면 순서 출처(기기 순서·계정 순서 캐시)가 이 순서가 되어 있다.
    setPendingOrder((pending) => (pending === ids ? null : pending));
  };

  const handlePrivacyToggle = () => {
    privacyModeStore.set(!isPrivacyMode);
    setRevealedId(null);
  };

  /** "수정" 링크가 `#/`로 push하기 전에 draft를 이 매물로 바꾼다(ADR-004). */
  const handleOpen = (listing: Listing) => {
    draftStore.update(listingToDraft(listing));
    onSuggestedNameChange("");
  };

  /** "복사" 링크가 `#/`로 push하기 전에 draft를 이 매물 값의 새 매물로 바꾸고 이름을 제안한다. 원본은 그대로다. */
  const handleCopy = (listing: Listing) => {
    draftStore.update(listingToCopyDraft(listing));
    onSuggestedNameChange(copiedListingName(listing.name));
  };

  /**
   * 메모만 바꾼다. 로그인이 끝나(401) 서버 매물 카드가 사라져도 쓰던 메모를 잃지 않게 목록 위에 남긴다.
   * 함께 쓰는 중 상대가 지운 매물(404)도 카드가 사라지므로 같은 자리에 이유와 함께 남긴다.
   */
  const handleSaveMemo = async (listing: Listing, memo: string) => {
    const result = await source.updateMemo(listing, memo);
    if (!result.ok && result.reason === "unauthorized" && memo !== "") {
      setWriteError(`'${listing.name}' 메모를 저장하지 못했습니다. 쓰던 메모: ${memo}`);
    }
    if (!result.ok && result.reason === "deletedInHousehold") {
      const typed = memo === "" ? "" : ` 쓰던 메모: ${memo}`;
      setWriteError(`'${listing.name}' ${DELETED_IN_HOUSEHOLD_MESSAGE}.${typed}`);
    }
    return result;
  };

  /**
   * 이름만 바꾼다. 로그인이 끝나(401) 서버 매물 카드가 사라져도 쓰던 이름을 잃지 않게 목록 위에 남긴다.
   * 함께 쓰는 중 상대가 지운 매물(404)도 같은 자리에 이유와 함께 남긴다.
   */
  const handleSaveName = async (listing: Listing, name: string) => {
    const result = await source.updateName(listing, name);
    if (!result.ok && result.reason === "unauthorized") {
      setWriteError(`'${listing.name}' 이름을 바꾸지 못했습니다. 쓰던 이름: ${name}`);
    }
    if (!result.ok && result.reason === "deletedInHousehold") {
      setWriteError(`'${listing.name}' ${DELETED_IN_HOUSEHOLD_MESSAGE}. 쓰던 이름: ${name}`);
    }
    return result;
  };

  const handleDelete = async (listing: Listing) => {
    if (!window.confirm(`'${listing.name}' 매물을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    const result = await source.remove(listing.id);
    setWriteError(result.ok ? null : DELETE_FAILURE_MESSAGES[result.reason]);
  };

  /** 시트는 연 시점의 매물을 담는다(링크는 만든 시점의 스냅샷). */
  const handleShare = (listing: Listing, button: HTMLButtonElement) => {
    sheet.open({ name: "share", target: { kind: "listing", listings: [listing] } }, button);
  };

  const handleShareList = () => {
    sheet.open(
      { name: "share", target: { kind: "list", listings: sortedListings } },
      shareListButtonRef.current,
    );
  };

  const handleStatusOpen = (listing: Listing, returnFocusTo: HTMLElement | null) => {
    sheet.open({ name: "status", listing }, returnFocusTo);
  };

  /** 상태만 바꾼다(다른 필드는 그대로). 시트는 바로 닫고, 지금 상태를 다시 고르면 쓰지 않는다. */
  const handleStatusSelect = async (listing: Listing, status: ListingStatus | null) => {
    sheet.close();
    if ((listing.status ?? null) === status) return;
    setStatusFailure(null);
    const result = await source.updateStatus(listing, status);
    // 함께 쓰는 중 상대가 지운 매물은 줄이 사라지므로 목록 위에 남긴다.
    if (!result.ok && result.reason === "deletedInHousehold") {
      setWriteError(`'${listing.name}' ${DELETED_IN_HOUSEHOLD_MESSAGE}`);
      return;
    }
    const message = result.ok ? null : STATUS_FAILURE_MESSAGES[result.reason];
    if (message !== null) setStatusFailure({ listingId: listing.id, message });
  };

  const renderSheet = () => {
    const openSheet = sheet.openSheet;
    if (openSheet === null) return null;
    if (openSheet.name === "share") {
      return (
        <ShareSheet
          target={openSheet.target}
          sentShareStore={sentShareStore}
          onClose={sheet.close}
        />
      );
    }
    return (
      <ListingStatusSheet
        listing={openSheet.listing}
        onSelect={(status) => void handleStatusSelect(openSheet.listing, status)}
        onClose={sheet.close}
      />
    );
  };

  const renderBody = () => {
    // 출처가 정해지기 전에는 로컬 목록을 먼저 그리지 않는다(서버 목록으로 바뀌며 깜빡이지 않게).
    if (list.status === "loading") {
      return (
        <p className={styles.notice} aria-busy="true">
          {accountImport.state?.status === "running"
            ? "이 기기의 매물을 계정으로 옮기는 중"
            : "저장 목록을 불러오는 중"}
        </p>
      );
    }
    // 제목 아래 안내가 [다시 시도]를 보인다. 로컬 목록으로 대신 보이지 않는다.
    if (list.status === "accountError") return null;
    if (list.status === "loadFailed") {
      return (
        <div className={styles.notice}>
          <p role="alert">목록을 불러오지 못했습니다</p>
          <button
            type="button"
            className={styles.retryButton}
            disabled={source.isRetrying}
            onClick={source.retry}
          >
            다시 시도
          </button>
        </div>
      );
    }
    if (list.status === "unavailable") {
      return <p className={styles.notice}>{UNAVAILABLE_MESSAGE}</p>;
    }
    if (list.status === "corrupt") {
      return <CorruptListingsNotice rawText={list.rawText} onReset={() => listingStore.reset()} />;
    }
    if (list.listings.length === 0) {
      return (
        <div className={styles.empty}>
          <p>저장한 매물이 없습니다</p>
          <a className={styles.emptyAction} href={PATHS.calculator}>
            계산하러 가기
          </a>
        </div>
      );
    }
    const overBudgetCount = sortedListings.filter(
      (listing) => budgetExcess(calculateLoan(listing, regulations).ownFunds, budget) !== null,
    ).length;
    const listLabel = `저장한 매물 ${sortedListings.length}개`;
    return (
      <>
        {/* 출처가 바뀌면(로그아웃·401) 열린 폼을 닫아, 계정에 넣으려던 값이 기기 예산으로 저장되지 않게 한다. */}
        <BudgetBar
          key={source.status}
          state={budgetSource.state}
          overBudgetCount={overBudgetCount}
          onSave={budgetSource.save}
          onRetry={budgetSource.retry}
          isRetrying={budgetSource.isRetrying}
          isMasked={isPrivacyMode}
        />
        {source.isRefreshFailed && (
          <p className={styles.warning}>
            최신 목록을 불러오지 못했습니다. 마지막으로 불러온 목록입니다
          </p>
        )}
        {orderError !== null && (
          <p role="alert" className={styles.error}>
            {orderError}
          </p>
        )}
        {renderListings(listLabel)}
      </>
    );
  };

  const renderListings = (listLabel: string) => {
    if (isOrderMissing) {
      if (orderSource.state.status === "loadFailed") {
        return (
          <div className={styles.notice}>
            <p role="alert">직접 정한 순서를 불러오지 못했습니다</p>
            <button
              type="button"
              className={styles.retryButton}
              disabled={orderSource.isRetrying}
              onClick={orderSource.retry}
            >
              다시 시도
            </button>
          </div>
        );
      }
      return (
        <p className={styles.notice} aria-busy="true">
          직접 정한 순서를 불러오는 중
        </p>
      );
    }
    return (
      <div className={styles.compactTable}>
        <div className={styles.compactHeader} aria-hidden="true">
          <span>이름</span>
          <span>필요한 자기자금</span>
        </div>
        <CompactListingList
          listings={sortedListings}
          label={listLabel}
          canReorder={canReorder}
          onReorder={handleReorder}
          regulations={regulations}
          budget={budget}
          onOpen={handleOpen}
          onCopy={handleCopy}
          onDelete={handleDelete}
          onShare={handleShare}
          onSaveMemo={handleSaveMemo}
          onSaveName={handleSaveName}
          onStatusOpen={handleStatusOpen}
          statusFailure={statusFailure}
          isPrivacyMode={isPrivacyMode}
          revealedId={revealedId}
          onRevealChange={setRevealedId}
        />
      </div>
    );
  };

  // 시트가 열린 동안 뒤 화면은 inert로 키보드·보조기기에서 빼낸다(aria-modal이 약속하는 동작).
  return (
    <>
      <div className={styles.page} inert={sheet.isOpen}>
        <header className={styles.header}>
          {/* 버튼이 제목과 한 줄에 다 들어가지 않으면(글자 크기를 키운 경우 등) 제목 아래 줄로 내려간다. */}
          <div className={styles.titleRow}>
            <h1 className={styles.title}>저장 목록</h1>
            <div className={styles.titleActions}>
              {sortedListings.length > 0 && (
                <>
                  {/* 켜짐은 aria-pressed와 채운 색으로 보인다. 이름은 바꾸지 않는다(토글 버튼 규칙). */}
                  <button
                    type="button"
                    className={styles.privacyButton}
                    aria-pressed={isPrivacyMode}
                    onClick={handlePrivacyToggle}
                  >
                    가리기
                  </button>
                  <button
                    ref={shareListButtonRef}
                    type="button"
                    className={styles.headerButton}
                    onClick={handleShareList}
                  >
                    목록 공유
                  </button>
                </>
              )}
            </div>
          </div>
          <p className={styles.baseDate}>
            규제 기준일 {regulations.baseDate} · 현재 규제로 다시 계산한 값입니다
          </p>
        </header>
        <HeaderNotices
          accountStatus={source.status}
          isSessionExpired={source.isSessionExpired}
          onAccountRetry={source.retry}
          isAccountRetrying={source.isRetrying}
          importProblem={importProblem}
          onImportRetry={accountImport.retry}
          notice={shownNotice}
          writeError={writeError}
        />
        {renderBody()}
      </div>
      {renderSheet()}
    </>
  );
}

export default MortgageListings;
