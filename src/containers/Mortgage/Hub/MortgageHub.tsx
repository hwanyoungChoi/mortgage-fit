import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

import MaskedValue from "@/components/MaskedValue";
import { useDraft } from "@/hooks/useDraft";
import { useInteriorPlanListSource } from "@/hooks/useInteriorPlanListSource";
import { useListingSource } from "@/hooks/useListingSource";
import { useOpenSheet } from "@/hooks/useOpenSheet";
import { ApiRequestError } from "@/lib/api/client";
import { INTERIOR_PLAN_TBD_LABEL } from "@/lib/constants/interiorPlanTable";
import { PATHS } from "@/lib/constants/paths";
import { accountImportProblem } from "@/lib/utils/accountImportProblem";
import { formatManwon, formatWon } from "@/lib/utils/amount";

import styles from "./MortgageHub.module.css";
import HouseholdSheet from "./components/HouseholdSheet";
import HubAccount from "./components/HubAccount";
import HubCard from "./components/HubCard";
import HubNotices, { type HubResult } from "./components/HubNotices";
import { useLeaveHousehold } from "./hooks/useLeaveHousehold";
import { useLogout } from "./hooks/useLogout";
import { summarizeHub } from "./summarizeHub";

import type { AccountImport } from "@/hooks/useAccountImport";
import type { InteriorPlanImport } from "@/hooks/useInteriorPlanImport";
import type { DraftStore } from "@/lib/types/draft";
import type { InteriorPlanStore } from "@/lib/types/interiorPlanStore";
import type { ListingStore } from "@/lib/types/listing";
import type { PrivacyModeStore } from "@/lib/types/privacyMode";
import type { LoginResult } from "@/lib/types/route";
import type { SessionHintStore } from "@/lib/types/sessionHint";

type MortgageHubProps = {
  listingStore: ListingStore;
  sessionHintStore: SessionHintStore;
  accountImport: AccountImport;
  interiorPlanStore: InteriorPlanStore;
  planImport: InteriorPlanImport;
  draftStore: DraftStore;
  /** 읽기만 한다. 홈에는 가리기 토글이 없다(U11). */
  privacyModeStore: PrivacyModeStore;
  /** [매물 모으기]로 가기 직전에 부른다(저장 목록 스크롤을 맨 위로). */
  onListingsNavigate: () => void;
  /** 카카오 로그인에서 돌아온 결과(`#/?login=`). 한 번 잡아 계정 자리 아래에 보이고 주소에서 지운다. */
  login: LoginResult | undefined;
};

/**
 * 나가기 확인(스펙 shared-list 시나리오 6, ADR-028 조건 5·개정). 초대한 사람인지 받은 사람인지 계약(`Household`)에 없어 두 경우를 함께 쓴다.
 */
const LEAVE_CONFIRM_MESSAGE = [
  "함께 쓰기에서 나갈까요?",
  "",
  "초대받아 참여했다면: 내가 원래 쓰던 목록과 예산·순서가 돌아옵니다. 함께 쓰는 동안 내가 넣은 매물은 가져갑니다.",
  "",
  "초대했다면: 함께 쓰던 목록과 예산·순서를 그대로 씁니다. 상대가 넣은 매물은 상대에게 갑니다.",
  "",
  "인테리어 계획: 함께 쓰는 동안 상대가 내 계획에 넣은 항목은 내 계획과 함께 나가고, 내가 상대 계획에 넣은 항목은 그 계획에 남습니다.",
  "",
  "상대가 지운 매물은 돌아오지 않습니다.",
].join("\n");

/** 홈의 시트(한 번에 하나, ADR-017): 함께 쓰기 */
type HubSheet = { name: "household" };

/**
 * 홈(허브, `#/`). 첫 화면이다(ADR-031 D1). 기능 카드 3개를 단계 없이 보인다: 대출 계산(가장 크게) → 매물 모으기 →
 * 우리 집 인테리어. 데이터가 있으면 소개 문구 자리에 내 현황을 보인다. 카드 위에는 계정 자리(로그아웃이면 카카오 로그인,
 * 로그인이면 상태 줄과 [로그아웃], 함께 쓰기 줄)와 그 아래 안내 줄을 둔다(ADR-035). 홈은 저장소에 쓰지 않는다(AC-0):
 * 계획은 읽기 훅만 쓰고, 매물 출처의 쓰기 함수는 부르지 않는다. 예외는 로그아웃·로그인 확인 결과의 session-hint다.
 */
function MortgageHub({
  listingStore,
  sessionHintStore,
  accountImport,
  interiorPlanStore,
  planImport,
  draftStore,
  privacyModeStore,
  onListingsNavigate,
  login,
}: MortgageHubProps) {
  const listingSource = useListingSource({ listingStore, sessionHintStore, accountImport });
  const planSource = useInteriorPlanListSource({
    store: interiorPlanStore,
    sessionHintStore,
    planImport,
  });
  const draft = useDraft(draftStore);
  const isPrivacyMode = useSyncExternalStore(
    privacyModeStore.subscribe,
    privacyModeStore.getSnapshot,
  );
  const logout = useLogout(sessionHintStore);
  const leaveHousehold = useLeaveHousehold();
  const sheet = useOpenSheet<HubSheet>();
  // 로그인 결과도 한 번 잡은 뒤 주소에서 지운다(replace). 새로고침해도 안내가 다시 뜨지 않는다.
  const [result, setResult] = useState<HubResult | null>(login ?? null);
  const accountRef = useRef<HTMLDivElement>(null);
  const noticesRef = useRef<HTMLDivElement>(null);
  // [로그아웃]을 눌렀거나 [나가기]가 401이었다. 버튼이 사라지면 포커스를 안내 줄이나 계정 자리로 옮긴다(ADR-035 조건 5).
  const isFocusPendingRef = useRef(false);
  const { status } = listingSource;
  const isSessionExpired = listingSource.isSessionExpired || planSource.isSessionExpired;

  useEffect(() => {
    if (login !== undefined) window.location.replace(PATHS.hub);
  }, [login]);

  /** 누른 버튼이 사라졌을 때 결과를 읽게 한다. 안내 줄이 없으면 계정 자리 */
  const focusNotices = () => {
    const line = noticesRef.current?.querySelector<HTMLElement>("[tabindex='-1']");
    (line ?? accountRef.current)?.focus();
  };

  useEffect(() => {
    if (!isFocusPendingRef.current || status === "loggedIn") return;
    isFocusPendingRef.current = false;
    focusNotices();
  }, [status]);

  // 로그인 상태일 때만 보인다(로그아웃하면 로컬 목록이 원본이라 옮기지 못한 것이 없다).
  const importProblem = status === "loggedIn" ? accountImportProblem(accountImport.state) : null;

  /** 401은 세션이 이미 끝난 것이라 로그아웃 성공으로 보고 세션 만료 줄을 보인다. 그 밖의 실패는 실패 줄이다. */
  const handleLogout = () => {
    setResult(null);
    isFocusPendingRef.current = true;
    logout.mutate(undefined, {
      onError: (error) => {
        if (error instanceof ApiRequestError && error.status === 401) {
          listingSource.expireSession();
          return;
        }
        isFocusPendingRef.current = false;
        setResult("logoutFailed");
      },
    });
  };

  const handleAccountRetry = () => {
    setResult(null);
    listingSource.retry();
  };

  const handleImportRetry = () => {
    setResult(null);
    accountImport.retry();
  };

  const handleHouseholdOpen = (button: HTMLButtonElement) => {
    setResult(null);
    sheet.open({ name: "household" }, button);
  };

  /** 열어 둔 동안 세션이 끝나(401) [함께 쓰기]가 사라졌으면 돌아갈 버튼 대신 안내 줄로 간다. */
  const handleSheetClose = () => {
    sheet.close();
    if (status !== "loggedIn") focusNotices();
  };

  /**
   * 나가면 목록·예산·순서·계획이 각자 것으로 돌아간다(훅이 다시 조회한다). 성공하면 [나가기]가 사라지므로 결과 줄로 포커스를 옮기고,
   * 401은 세션 만료 줄, 그 밖의 실패는 실패 줄이다([나가기]가 남는다).
   */
  const handleLeave = () => {
    if (!window.confirm(LEAVE_CONFIRM_MESSAGE)) return;
    setResult(null);
    leaveHousehold.mutate(undefined, {
      onSuccess: () => {
        flushSync(() => setResult("householdLeft"));
        focusNotices();
      },
      onError: (error) => {
        if (error instanceof ApiRequestError && error.status === 401) {
          isFocusPendingRef.current = true;
          listingSource.expireSession();
          return;
        }
        setResult("leaveFailed");
      },
    });
  };

  const summary = summarizeHub({
    draft,
    listings: listingSource.list,
    isListingsHousehold: listingSource.household !== null,
    plans: planSource.list,
  });

  // 시트가 열린 동안 뒤 화면은 inert로 키보드·보조기기에서 빼낸다(aria-modal이 약속하는 동작).
  return (
    <>
      <div className={styles.page} inert={sheet.isOpen}>
        <h1 className={styles.title}>홈</h1>
        {/* 버튼이 사라졌는데 안내 줄이 없을 때 포커스를 받는 자리 */}
        <div ref={accountRef} tabIndex={-1}>
          <HubAccount
            status={status}
            hasSessionHint={sessionHintStore.has()}
            onLogout={handleLogout}
            isLoggingOut={logout.isPending}
            onAccountRetry={handleAccountRetry}
            isAccountRetrying={listingSource.isRetrying}
            household={listingSource.household}
            onHouseholdOpen={handleHouseholdOpen}
            onLeave={handleLeave}
            isLeaving={leaveHousehold.isPending}
          />
        </div>
        <HubNotices
          ref={noticesRef}
          result={result}
          isLoggedIn={status === "loggedIn"}
          isSessionExpired={isSessionExpired}
          importProblem={importProblem}
          onImportRetry={handleImportRetry}
        />
        <ul className={styles.cards}>
          <li>
            <HubCard
              title="대출 계산"
              href={PATHS.calculator}
              intro="매매가와 KB시세로 예상 한도와 필요한 자기자금을 계산합니다"
              summary={summary.calculator}
              renderSummary={(salePrice) => (
                <>
                  작성 중 · 매매가{" "}
                  <MaskedValue isMasked={isPrivacyMode}>{formatManwon(salePrice)}</MaskedValue>
                </>
              )}
              isPrimary
            />
          </li>
          <li>
            <HubCard
              title="매물 모으기"
              href={PATHS.listings}
              intro="본 매물을 저장해 자기자금·추가 비용을 비교합니다"
              summary={summary.listings}
              renderSummary={({ count, isHousehold }) =>
                isHousehold ? `함께 쓰는 목록 · 매물 ${count}개` : `저장한 매물 ${count}개`
              }
              onClick={onListingsNavigate}
            />
          </li>
          <li>
            <HubCard
              title="우리 집 인테리어"
              href={PATHS.home()}
              intro="공정별 업체 견적을 모아 확정한 금액을 예산과 비교합니다"
              summary={summary.home}
              renderSummary={(lines) =>
                lines.map((line) => (
                  <span key={line.id} className={styles.planLine}>
                    {line.name} · 지출 예정{" "}
                    <MaskedValue isMasked={isPrivacyMode}>
                      {formatWon(line.plannedTotalWon)}
                    </MaskedValue>
                    {/* 확정 미정 줄 수. 가리기 중에는 구분자까지 통째로 뺀다(U6) */}
                    {line.tbdCount > 0 &&
                      !isPrivacyMode &&
                      ` · ${INTERIOR_PLAN_TBD_LABEL} ${line.tbdCount}건`}
                  </span>
                ))
              }
            />
          </li>
        </ul>
      </div>
      {sheet.openSheet !== null && (
        <HouseholdSheet
          status={status}
          household={listingSource.household}
          onUnauthorized={listingSource.expireSession}
          onClose={handleSheetClose}
        />
      )}
    </>
  );
}

export default MortgageHub;
