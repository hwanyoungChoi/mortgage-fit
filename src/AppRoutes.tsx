import { useCallback, useState, useSyncExternalStore } from "react";

import TabNav from "@/components/TabNav";
import TextSizeSheet from "@/components/TextSizeSheet";
import MortgageCalculator from "@/containers/Mortgage/Calculator/MortgageCalculator";
import MortgageInvite from "@/containers/Mortgage/Invite/MortgageInvite";
import MortgageListings from "@/containers/Mortgage/Listings/MortgageListings";
import { resetListingsScroll } from "@/containers/Mortgage/Listings/hooks/useListingsScrollRestoration";
import MortgageShare from "@/containers/Mortgage/Share/MortgageShare";
import { useAccountImport } from "@/hooks/useAccountImport";
import { useHashRoute } from "@/hooks/useHashRoute";
import { useOpenSheet } from "@/hooks/useOpenSheet";
import { LOAN_REGULATIONS } from "@/lib/constants/loanRegulations";
import { PATHS } from "@/lib/constants/paths";
import { createAccountImportStore } from "@/lib/utils/accountImportStorage";
import { getBrowserStorage } from "@/lib/utils/browserStorage";
import { createBudgetImportStore } from "@/lib/utils/budgetImportStorage";
import { createBudgetStore } from "@/lib/utils/budgetStorage";
import { createRandomId } from "@/lib/utils/createRandomId";
import { createDraftStore } from "@/lib/utils/draftStorage";
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
    },
  ] = useState(() => createStores(storage ?? getBrowserStorage()));
  const route = useHashRoute();
  const textSize = useSyncExternalStore(textSizeStore.subscribe, textSizeStore.getSnapshot);
  // 글자 크기 시트는 모든 화면 위에 뜬다. 열린 동안 탭과 화면은 inert다(aria-modal이 약속하는 동작).
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

  /**
   * 공유받은 매물 추가·함께 쓰기 수락 뒤 목록 맨 위로 간다. replace라 뒤로 가기로 그 화면에 돌아와 또 추가·수락하지 않는다.
   */
  const goToListingsWithNotice = (notice: string) => {
    setListingsNotice(notice);
    resetListingsScroll();
    window.location.replace(PATHS.listings());
  };

  const renderScreen = () => {
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
          draftStore={draftStore}
          onAccepted={goToListingsWithNotice}
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

  // 탭으로 들어온 목록은 맨 위에서 시작한다. 스크롤 복원은 카드 → 계산 → 뒤로 가기에서만 일어난다.
  return (
    <>
      <div inert={textSizeSheet.isOpen}>
        <TabNav
          current={route.name === "share" || route.name === "invite" ? null : route.name}
          onNavigate={resetListingsScroll}
          onTextSizeOpen={(button) => textSizeSheet.open("textSize", button)}
        />
        {renderScreen()}
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
