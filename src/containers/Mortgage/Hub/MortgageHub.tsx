import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import MaskedValue from "@/components/MaskedValue";
import { useDraft } from "@/hooks/useDraft";
import { useInteriorPlanListSource } from "@/hooks/useInteriorPlanListSource";
import { useListingSource } from "@/hooks/useListingSource";
import { ApiRequestError } from "@/lib/api/client";
import { INTERIOR_PLAN_TBD_LABEL } from "@/lib/constants/interiorPlanTable";
import { PATHS } from "@/lib/constants/paths";
import { accountImportProblem } from "@/lib/utils/accountImportProblem";
import { formatManwon, formatWon } from "@/lib/utils/amount";

import styles from "./MortgageHub.module.css";
import HubAccount from "./components/HubAccount";
import HubCard from "./components/HubCard";
import HubNotices, { type HubResult } from "./components/HubNotices";
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
 * 홈(허브, `#/`). 첫 화면이다(ADR-031 D1). 기능 카드 3개를 단계 없이 보인다: 대출 계산(가장 크게) → 매물 모으기 →
 * 우리 집 인테리어. 데이터가 있으면 소개 문구 자리에 내 현황을 보인다. 카드 위에는 계정 자리(로그아웃이면 카카오 로그인,
 * 로그인이면 상태 줄과 [로그아웃])와 그 아래 안내 줄을 둔다(ADR-035). 홈은 저장소에 쓰지 않는다(AC-0):
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
  // 로그인 결과도 한 번 잡은 뒤 주소에서 지운다(replace). 새로고침해도 안내가 다시 뜨지 않는다.
  const [result, setResult] = useState<HubResult | null>(login ?? null);
  const accountRef = useRef<HTMLDivElement>(null);
  const noticesRef = useRef<HTMLDivElement>(null);
  // [로그아웃]을 눌렀다. 성공(또는 401)으로 버튼이 사라지면 포커스를 안내 줄이나 계정 자리로 옮긴다(ADR-035 조건 5).
  const isFocusPendingRef = useRef(false);
  const { status } = listingSource;
  const isSessionExpired = listingSource.isSessionExpired || planSource.isSessionExpired;

  useEffect(() => {
    if (login !== undefined) window.location.replace(PATHS.hub);
  }, [login]);

  useEffect(() => {
    if (!isFocusPendingRef.current || status === "loggedIn") return;
    isFocusPendingRef.current = false;
    const line = noticesRef.current?.querySelector<HTMLElement>("[tabindex='-1']");
    (line ?? accountRef.current)?.focus();
  }, [status]);

  // 로그인 상태일 때만 보인다(로그아웃하면 로컬 목록이 원본이라 옮기지 못한 것이 없다).
  const importProblem = status === "loggedIn" ? accountImportProblem(accountImport.state) : null;
  // 로그아웃 실패는 아직 로그인 상태일 때만 의미가 있다(그 뒤 세션이 끝나면 지운다).
  const visibleResult = result === "logoutFailed" && status !== "loggedIn" ? null : result;

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

  const summary = summarizeHub({
    draft,
    listings: listingSource.list,
    isListingsHousehold: listingSource.household !== null,
    plans: planSource.list,
  });

  return (
    <div className={styles.page}>
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
        />
      </div>
      <HubNotices
        ref={noticesRef}
        result={visibleResult}
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
  );
}

export default MortgageHub;
