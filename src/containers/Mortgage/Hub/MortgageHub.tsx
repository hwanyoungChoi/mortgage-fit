import { useSyncExternalStore } from "react";

import MaskedValue from "@/components/MaskedValue";
import { useDraft } from "@/hooks/useDraft";
import { useInteriorPlanListSource } from "@/hooks/useInteriorPlanListSource";
import { useListingSource } from "@/hooks/useListingSource";
import { PATHS } from "@/lib/constants/paths";
import { formatManwon } from "@/lib/utils/amount";

import styles from "./MortgageHub.module.css";
import HubCard from "./components/HubCard";
import { summarizeHub } from "./summarizeHub";

import type { AccountImport } from "@/hooks/useAccountImport";
import type { InteriorPlanImport } from "@/hooks/useInteriorPlanImport";
import type { DraftStore } from "@/lib/types/draft";
import type { InteriorPlanStore } from "@/lib/types/interiorPlanStore";
import type { ListingStore } from "@/lib/types/listing";
import type { PrivacyModeStore } from "@/lib/types/privacyMode";
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
};

/**
 * 홈(허브, `#/`). 첫 화면이다(ADR-031 D1). 기능 카드 3개를 단계 없이 보인다: 대출 계산(가장 크게) → 매물 모으기 →
 * 우리 집 인테리어. 데이터가 있으면 소개 문구 자리에 내 현황을 보인다. 홈은 저장소에 쓰지 않는다(AC-0):
 * 계획은 읽기 훅만 쓰고, 매물 출처의 쓰기 함수는 부르지 않는다.
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
  const summary = summarizeHub({
    draft,
    listings: listingSource.list,
    isListingsHousehold: listingSource.household !== null,
    plans: planSource.list,
    now: new Date(),
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>홈</h1>
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
            href={PATHS.listings()}
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
            intro="계약한 집의 인테리어 예산·견적·지급을 정리합니다"
            summary={summary.home}
            renderSummary={(lines) =>
              lines.map((line) => (
                <span key={line.id} className={styles.planLine}>
                  {line.name} · 앞으로 낼 돈{" "}
                  <MaskedValue isMasked={isPrivacyMode}>
                    {formatManwon(line.upcomingTotal)}
                  </MaskedValue>
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
