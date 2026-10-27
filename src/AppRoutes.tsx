import { useCallback, useState, useSyncExternalStore } from "react";

import AppHeader from "@/components/AppHeader";
import TabNav from "@/components/TabNav";
import TextSizeSheet from "@/components/TextSizeSheet";
import MortgageCalculator from "@/containers/Mortgage/Calculator/MortgageCalculator";
import MortgageHome from "@/containers/Mortgage/Home/MortgageHome";
import MortgageHub from "@/containers/Mortgage/Hub/MortgageHub";
import MortgageInvite from "@/containers/Mortgage/Invite/MortgageInvite";
import MortgageListings from "@/containers/Mortgage/Listings/MortgageListings";
import { resetListingsScroll } from "@/containers/Mortgage/Listings/hooks/useListingsScrollRestoration";
import MortgageShare from "@/containers/Mortgage/Share/MortgageShare";
import { useAccountImport } from "@/hooks/useAccountImport";
import { useHashRoute } from "@/hooks/useHashRoute";
import { useInteriorPlanImport } from "@/hooks/useInteriorPlanImport";
import { useOpenSheet } from "@/hooks/useOpenSheet";
import { LOAN_REGULATIONS } from "@/lib/constants/loanRegulations";
import { PATHS } from "@/lib/constants/paths";
import { createAccountImportStore } from "@/lib/utils/accountImportStorage";
import { getBrowserStorage } from "@/lib/utils/browserStorage";
import { createBudgetImportStore } from "@/lib/utils/budgetImportStorage";
import { createBudgetStore } from "@/lib/utils/budgetStorage";
import { createRandomId } from "@/lib/utils/createRandomId";
import { createDraftStore } from "@/lib/utils/draftStorage";
import { createInteriorPlanImportStore } from "@/lib/utils/interiorPlanImportStorage";
import { createInteriorPlanStore } from "@/lib/utils/interiorPlanStorage";
import { createListingOrderImportStore } from "@/lib/utils/listingOrderImportStorage";
import { createListingOrderStore } from "@/lib/utils/listingOrderStorage";
import { createListingStore } from "@/lib/utils/listingStore";
import { createPrivacyModeStore } from "@/lib/utils/privacyModeStorage";
import { createSentShareStore } from "@/lib/utils/sentShareStorage";
import { createSessionHintStore } from "@/lib/utils/sessionHintStorage";
import { createTextSizeStore } from "@/lib/utils/textSizeStorage";
import { createTradeLookupStore } from "@/lib/utils/tradeLookupStorage";

import type { Regulations } from "@/lib/types/regulation";

type AppRoutesProps = {
  /** 기본은 브라우저 localStorage. 테스트에서 손상·접근 불가 Storage를 넣는다. 마운트 때 한 번만 읽는다. */
  storage?: Storage;
  /** 기본은 LOAN_REGULATIONS. 테스트에서 규제 fixture를 넣는다. */
  regulations?: Regulations;
};

function createStores(storage: Storage) {
  return {
    listingStore: createListingStore({
      storage,
      createId: createRandomId,
      now: () => new Date().toISOString(),
    }),
    draftStore: createDraftStore({ storage }),
    tradeLookupStore: createTradeLookupStore({ storage }),
    budgetStore: createBudgetStore({ storage }),
    budgetImportStore: createBudgetImportStore({ storage }),
    listingOrderStore: createListingOrderStore({ storage }),
    listingOrderImportStore: createListingOrderImportStore({ storage }),
    sentShareStore: createSentShareStore({ storage, now: Date.now }),
    sessionHintStore: createSessionHintStore({ storage }),
    accountImportStore: createAccountImportStore({ storage }),
    privacyModeStore: createPrivacyModeStore({ storage }),
    textSizeStore: createTextSizeStore({ storage }),
    interiorPlanStore: createInteriorPlanStore({
      storage,
      createId: createRandomId,
      now: () => new Date().toISOString(),
    }),
    interiorPlanImportStore: createInteriorPlanImportStore({ storage }),
  };
}

/** 라우트별 화면 선택은 이 파일 한 곳에서 한다. 화면들은 같은 스토어를 공유한다. */
function AppRoutes({ storage, regulations = LOAN_REGULATIONS }: AppRoutesProps) {
  const [
    {
      listingStore,
      draftStore,
      tradeLookupStore,
      budgetStore,
      budgetImportStore,
      listingOrderStore,
      listingOrderImportStore,
      sentShareStore,
      sessionHintStore,
      accountImportStore,
      privacyModeStore,
      textSizeStore,
      interiorPlanStore,
      interiorPlanImportStore,
    },
  ] = useState(() => createStores(storage ?? getBrowserStorage()));
  const route = useHashRoute();
  const textSize = useSyncExternalStore(textSizeStore.subscribe, textSizeStore.getSnapshot);
  // 글자 크기 시트는 모든 화면 위에 뜬다. 열린 동안 머리 줄·화면·탭은 inert다(aria-modal이 약속하는 동작).
  const textSizeSheet = useOpenSheet<"textSize">();
  // 저장 시트 이름 제안. 목록의 "복사"가 채우고 계산 화면이 쓰므로 두 화면 위에 둔다.
  const [suggestedName, setSuggestedName] = useState("");
  // 저장 목록에 한 번 보일 알림. 주소에 두면 새로고침·공유 때 다시 뜨므로 메모리에 둔다.
  const [listingsNotice, setListingsNotice] = useState<string | null>(null);
  const handleAccountImported = useCallback((importedCount: number) => {
    setListingsNotice(`이 기기의 매물 ${importedCount}개를 계정으로 옮겼습니다`);
  }, []);
  // 로그인 확인 직후 이 기기의 매물을 계정으로 옮긴다. 화면을 오가도 한 번만 하도록 화면들 위에 둔다.
  const accountImport = useAccountImport({
    listingStore,
    accountImportStore,
    onImported: handleAccountImported,
  });
  // [우리 집]에 한 번 보일 알림. 매물 이전 알림(저장 목록)과 따로 두어 서로 덮지 않는다.
  const [homeNotice, setHomeNotice] = useState<string | null>(null);
  const handleInteriorPlanImported = useCallback(() => {
    setHomeNotice("이 기기의 인테리어 계획을 계정으로 옮겼습니다");
  }, []);
  // 로그인 확인 직후 이 기기의 인테리어 계획을 계정으로 옮긴다. 매물 이전과 같은 자리(화면들 위)에서 한 번만 한다.
  const planImport = useInteriorPlanImport({
    interiorPlanStore,
    interiorPlanImportStore,
    onImported: handleInteriorPlanImported,
  });

  /**
   * 공유받은 매물 추가·함께 쓰기 수락 뒤 목록 맨 위로 간다. replace라 뒤로 가기로 그 화면에 돌아와 또 추가·수락하지 않는다.
   */
  const goToListingsWithNotice = (notice: string) => {
    setListingsNotice(notice);
    resetListingsScroll();
    window.location.replace(PATHS.listings());
  };

  const renderScreen = () => {
    if (route.name === "hub") {
      return (
        <MortgageHub
          listingStore={listingStore}
          sessionHintStore={sessionHintStore}
          accountImport={accountImport}
          interiorPlanStore={interiorPlanStore}
          planImport={planImport}
          draftStore={draftStore}
          privacyModeStore={privacyModeStore}
          onListingsNavigate={resetListingsScroll}
        />
      );
    }
    if (route.name === "share") {
      return (
        <MortgageShare
          token={route.token}
          listingStore={listingStore}
          sessionHintStore={sessionHintStore}
          accountImport={accountImport}
          regulations={regulations}
          onAdded={goToListingsWithNotice}
        />
      );
    }
    if (route.name === "invite") {
      return (
        <MortgageInvite
          token={route.token}
          listingStore={listingStore}
          sessionHintStore={sessionHintStore}
          accountImport={accountImport}
          accountImportStore={accountImportStore}
          budgetImportStore={budgetImportStore}
          listingOrderImportStore={listingOrderImportStore}
          draftStore={draftStore}
          onAccepted={goToListingsWithNotice}
        />
      );
    }
    if (route.name === "home") {
      // 플랜을 바꾸면(고르기 → 플랜, 뒤로 가기) 화면 상태와 열린 시트를 새로 시작한다.
      return (
        <MortgageHome
          key={route.planId ?? ""}
          interiorPlanStore={interiorPlanStore}
          sessionHintStore={sessionHintStore}
          planImport={planImport}
          privacyModeStore={privacyModeStore}
          listingStore={listingStore}
          accountImport={accountImport}
          planId={route.planId}
          listingId={route.listingId}
          view={route.view ?? "space"}
          notice={homeNotice}
          onNoticeChange={setHomeNotice}
        />
      );
    }
    if (route.name === "listings") {
      return (
        <MortgageListings
          listingStore={listingStore}
          sessionHintStore={sessionHintStore}
          accountImport={accountImport}
          draftStore={draftStore}
          budgetStore={budgetStore}
          budgetImportStore={budgetImportStore}
          listingOrderStore={listingOrderStore}
          listingOrderImportStore={listingOrderImportStore}
          sentShareStore={sentShareStore}
          privacyModeStore={privacyModeStore}
          regulations={regulations}
          login={route.login}
          onSuggestedNameChange={setSuggestedName}
          notice={listingsNotice}
          onNoticeChange={setListingsNotice}
        />
      );
    }
    return (
      <MortgageCalculator
        listingStore={listingStore}
        sessionHintStore={sessionHintStore}
        accountImport={accountImport}
        draftStore={draftStore}
        tradeLookupStore={tradeLookupStore}
        regulations={regulations}
        suggestedName={suggestedName}
        onSuggestedNameChange={setSuggestedName}
      />
    );
  };

  // DOM 순서 = 보이는 순서: 머리 줄(main 바깥) → 화면 → 하단 탭.
  // 탭으로 들어온 목록은 맨 위에서 시작한다. 스크롤 복원은 카드 → 계산 → 뒤로 가기에서만 일어난다.
  return (
    <>
      <div inert={textSizeSheet.isOpen}>
        <AppHeader onTextSizeOpen={(button) => textSizeSheet.open("textSize", button)} />
        <main>{renderScreen()}</main>
        <TabNav
          current={route.name === "share" || route.name === "invite" ? null : route.name}
          onNavigate={resetListingsScroll}
        />
      </div>
      {textSizeSheet.isOpen && (
        <TextSizeSheet
          value={textSize}
          onSelect={textSizeStore.set}
          onClose={textSizeSheet.close}
        />
      )}
    </>
  );
}

export default AppRoutes;
