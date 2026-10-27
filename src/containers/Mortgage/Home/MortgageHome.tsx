import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import Sheet from "@/components/Sheet";
import StatusPanel from "@/components/StatusPanel";
import { useListingSource } from "@/hooks/useListingSource";
import { useOpenSheet } from "@/hooks/useOpenSheet";
import { PATHS } from "@/lib/constants/paths";
import { toggleLineConfirmInput } from "@/lib/utils/interiorLineWrites";
import { buildInteriorPlanRows } from "@/lib/utils/interiorPlanRows";

import styles from "./MortgageHome.module.css";
import CorruptPlansNotice from "./components/CorruptPlansNotice";
import CreatePlanSheet from "./components/CreatePlanSheet";
import HomeEmpty from "./components/HomeEmpty";
import HomeNotices from "./components/HomeNotices";
import ItemSheet from "./components/ItemSheet";
import PlanPicker from "./components/PlanPicker";
import PlanScreen from "./components/PlanScreen";
import PlanSettingsSheet from "./components/PlanSettingsSheet";
import { useInteriorPlanSource } from "./hooks/useInteriorPlanSource";
import { interiorPlanImportProblem } from "./interiorPlanImportProblem";
import { linkedListingOf } from "./linkedListing";
import { LISTING_ENTRY_NOTICES, resolveListingEntry } from "./listingEntry";
import { DELETED_IN_HOUSEHOLD_MESSAGE } from "./planWriteFailure";

import type { AccountImport } from "@/hooks/useAccountImport";
import type { InteriorPlanImport } from "@/hooks/useInteriorPlanImport";
import type { InteriorPlanCreateInput, InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { InteriorPlanStore } from "@/lib/types/interiorPlanStore";
import type { Listing, ListingStore } from "@/lib/types/listing";
import type { PrivacyModeStore } from "@/lib/types/privacyMode";
import type { HomeView } from "@/lib/types/route";
import type { SessionHintStore } from "@/lib/types/sessionHint";

type MortgageHomeProps = {
  /** 로그아웃 상태의 플랜 원본(새 키 하나만 쓴다). 로그인 중에는 서버가 원본이다 */
  interiorPlanStore: InteriorPlanStore;
  sessionHintStore: SessionHintStore;
  /** 로그인 직후 이 기기 계획의 이전. 옮기지 못했으면 화면 위에 이유와 [다시 시도]를 보인다 */
  planImport: InteriorPlanImport;
  /** 저장 목록과 같은 가리기 설정. 켜면 금액·연락처·메모를 그리지 않는다 */
  privacyModeStore: PrivacyModeStore;
  /** 매물 출처(저장 목록과 같은 `useListingSource`). 읽기만 한다: 연결 매물 이름·삭제 표시와 `?listing=`의 매물 찾기 */
  listingStore: ListingStore;
  accountImport: AccountImport;
  /** 주소의 플랜 id(`#/home/{planId}`). 없으면 플랜 수로 화면을 고른다 */
  planId: string | undefined;
  /** 매물 카드에서 들어온 길(`#/home?listing={id}`). 처리한 뒤 주소에서 지운다 */
  listingId: string | undefined;
  view: HomeView;
  /** 이전이 남긴 알림(이 기기 계획을 계정으로 옮김). 한 번만 보인다 */
  notice: string | null;
  onNoticeChange: (notice: string | null) => void;
};

/** [우리 집] 화면의 시트(한 번에 하나, ADR-017) */
type HomeSheet =
  /** `listing`: 매물 카드에서 왔으면 그 매물(이름·추가 비용 인테리어 줄을 채운다) */
  | { name: "create"; listing: Listing | null }
  | { name: "settings"; planId: string; isBudget: boolean }
  /** 줄 시트. `rowKey`는 고칠 줄(`item.id:quote.id`), null이면 새 줄이고 `trade`로 구분을 채운다 */
  | { name: "line"; planId: string; rowKey: string | null; trade: string };

const UNAVAILABLE_MESSAGE =
  "이 브라우저에서는 저장소를 사용할 수 없어 인테리어 계획을 쓸 수 없습니다";

/** 열어 둔 시트의 계획·항목이 사라진 곳. expired: 로그인이 끝나(401) 서버 계획이 화면에서 빠졌다 */
type MissingContext = "local" | "account" | "household" | "expired";

const MISSING_MESSAGES: Record<MissingContext, { plan: string; item: string }> = {
  local: { plan: "다른 탭에서 삭제된 계획입니다", item: "다른 탭에서 삭제된 항목입니다" },
  account: { plan: "다른 기기에서 삭제된 계획입니다", item: "다른 기기에서 삭제된 항목입니다" },
  household: { plan: "함께 쓰는 사람이 삭제한 계획입니다", item: DELETED_IN_HOUSEHOLD_MESSAGE },
  expired: {
    plan: "로그인이 끝나 저장하지 못했습니다. 다시 로그인해 주세요",
    item: "로그인이 끝나 저장하지 못했습니다. 다시 로그인해 주세요",
  },
};

/** 열어 둔 시트의 계획·항목이 다른 탭에서 지워졌을 때 */
function MissingSheet({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <Sheet title="찾을 수 없습니다" onClose={onClose}>
      <p>{message}</p>
    </Sheet>
  );
}

/**
 * 우리 집: 공정별 업체 견적 줄과 확정 합계(스펙 interior-simple). 합계는 저장하지 않고 매번 계산한다(ADR-007).
 * `#/home`은 플랜 0개면 빈 상태, 1개면 그 플랜, 2~3개면 고르기다. 표 보기는 주소(`?view=table`)에 둔다.
 * `#/home?listing={id}`(매물 카드)는 그 매물에 연결된 플랜이 있으면 `#/home/{planId}`로 replace하고, 없으면 그 매물로 채운
 * 만들기 시트를 연 뒤 주소에서 `listing`을 지운다(replace). 매물 쪽에는 아무것도 쓰지 않는다(AC-6).
 */
function MortgageHome({
  interiorPlanStore,
  sessionHintStore,
  planImport,
  privacyModeStore,
  listingStore,
  accountImport,
  planId,
  listingId,
  view,
  notice,
  onNoticeChange,
}: MortgageHomeProps) {
  const source = useInteriorPlanSource({
    store: interiorPlanStore,
    sessionHintStore,
    planImport,
  });
  const { list } = source;
  const listingSource = useListingSource({ listingStore, sessionHintStore, accountImport });
  const isPrivacyMode = useSyncExternalStore(
    privacyModeStore.subscribe,
    privacyModeStore.getSnapshot,
  );
  const sheet = useOpenSheet<HomeSheet>();
  // [최신 값 불러오기]: 줄 시트를 지금 값으로 다시 연다(같은 항목 동시 편집 경고 뒤)
  const [itemSheetVersion, setItemSheetVersion] = useState(0);
  // 알림은 잡아 둔 뒤 위에서 비운다. 다른 화면을 거쳐 돌아와도 다시 뜨지 않는다.
  const [shownNotice, setShownNotice] = useState(notice);
  const plans = list.status === "ok" ? list.plans : [];
  const findPlan = (id: string) => plans.find((plan) => plan.id === id) ?? null;

  /** 주소에 플랜이 있으면 그 플랜, 없으면 하나뿐일 때 그 플랜 */
  const currentPlan =
    planId === undefined ? (plans.length === 1 ? plans[0] : null) : findPlan(planId);

  useEffect(() => {
    if (notice === null) return;
    setShownNotice(notice);
    onNoticeChange(null);
  }, [notice, onNoticeChange]);

  // 매물 카드에서 왔다(`?listing=`). 계획 목록이 정해진 뒤 한 번만 처리한다(주소 변경 이벤트가 오기 전에 다시 돌지 않게).
  const listingEntry =
    listingId !== undefined && list.status === "ok"
      ? resolveListingEntry(listingId, list.plans, listingSource.list)
      : null;
  const handledListingIdRef = useRef<string | null>(null);
  useEffect(() => {
    // 주소에서 listing이 빠지면 기록을 비운다(같은 화면에서 같은 주소로 다시 오면 다시 처리한다).
    if (listingId === undefined) {
      handledListingIdRef.current = null;
      return;
    }
    if (listingEntry === null || listingEntry.action === "wait") return;
    if (handledListingIdRef.current === listingId) return;
    handledListingIdRef.current = listingId;
    if (listingEntry.action === "openPlan") {
      window.location.replace(PATHS.home({ planId: listingEntry.planId }));
      return;
    }
    // 주소에서 listing을 지운다. 새로고침·뒤로 가기로 시트·안내가 다시 뜨지 않는다.
    window.location.replace(PATHS.home({ planId, view }));
    if (listingEntry.action === "create") {
      sheet.open({ name: "create", listing: listingEntry.listing }, null);
    } else {
      setShownNotice(LISTING_ENTRY_NOTICES[listingEntry.reason]);
    }
  }, [listingId, listingEntry, planId, view, sheet]);

  // 로그인 상태일 때만 보인다(로그아웃하면 로컬 계획이 원본이라 옮기지 못한 것이 없다).
  const importProblem =
    source.status === "loggedIn" ? interiorPlanImportProblem(planImport.state) : null;

  const missingContext: MissingContext = source.isSessionExpired
    ? "expired"
    : source.status !== "loggedIn"
      ? "local"
      : source.household === null
        ? "account"
        : "household";
  const missingMessages = MISSING_MESSAGES[missingContext];

  /** 보기 바꾸기는 탭처럼 replace다(뒤로 가기가 보기 전환을 하나씩 되감지 않는다) */
  const handleViewChange = (nextView: HomeView) => {
    window.location.replace(PATHS.home({ planId, view: nextView }));
  };

  const handleCreate = async (input: InteriorPlanCreateInput) => {
    const result = await source.createPlan(input);
    if (result.ok) {
      sheet.close();
      // 만든 플랜으로 간다. replace라 뒤로 가기가 빈 상태(이제는 같은 플랜)로 돌아가지 않는다.
      window.location.replace(PATHS.home({ planId: result.plan.id }));
    }
    return result;
  };

  const handleDeletePlan = async (plan: InteriorPlanWithItems) => {
    const result = await source.removePlan(plan.id);
    if (result.ok) {
      sheet.close();
      window.location.replace(PATHS.home());
    }
    return result;
  };

  const renderSheet = () => {
    const openSheet = sheet.openSheet;
    if (openSheet === null) return null;
    if (openSheet.name === "create") {
      return (
        <CreatePlanSheet
          onCreate={handleCreate}
          listing={openSheet.listing}
          onClose={sheet.close}
        />
      );
    }
    const plan = findPlan(openSheet.planId);
    // 다른 탭·기기·함께 쓰는 사람이 플랜을 지웠다. 시트를 닫을 수 있게만 둔다(뒤 화면의 inert가 풀리도록).
    if (plan === null) return <MissingSheet message={missingMessages.plan} onClose={sheet.close} />;
    if (openSheet.name === "settings") {
      return (
        <PlanSettingsSheet
          plan={plan}
          planCount={plans.length}
          focusBudget={openSheet.isBudget}
          onSave={async (patch) => {
            const result = await source.updatePlan(plan.id, patch);
            if (result.ok) sheet.close();
            return result;
          }}
          onDelete={() => handleDeletePlan(plan)}
          onUnlinkListing={() => source.updatePlan(plan.id, { listingId: null })}
          onCreateAnother={() => sheet.open({ name: "create", listing: null }, null)}
          onClose={sheet.close}
        />
      );
    }
    const row =
      openSheet.rowKey === null
        ? null
        : (buildInteriorPlanRows(plan)
            .groups.flatMap((group) => group.rows)
            .find((candidate) => candidate.key === openSheet.rowKey) ?? null);
    const item = row?.item ?? null;
    // 고치던 줄을 다른 곳에서 지웠다. 새 줄로 저장되지 않게 시트를 바꾼다.
    if (openSheet.rowKey !== null && row === null) {
      return <MissingSheet message={missingMessages.item} onClose={sheet.close} />;
    }
    // 폴링으로 item이 바뀌어도 시트는 연 시점의 값에서 시작한 입력을 그대로 둔다(ItemSheet가 열 때 한 번만 읽는다).
    return (
      <ItemSheet
        key={itemSheetVersion}
        plan={plan}
        item={item}
        initialSpaceId={plan.spaces[0].id}
        onSave={async (input, openedItem) => {
          const result =
            openedItem === null
              ? await source.addItem(plan.id, input)
              : await source.updateItem(plan.id, openedItem.id, input, openedItem.updatedAt);
          if (result.ok) sheet.close();
          return result;
        }}
        onReload={() => setItemSheetVersion((version) => version + 1)}
        onDelete={async (itemId) => {
          const result = await source.removeItem(plan.id, itemId);
          if (result.ok) sheet.close();
          return result;
        }}
        onClose={sheet.close}
      />
    );
  };

  const renderPlan = (plan: InteriorPlanWithItems) => (
    <PlanScreen
      plan={plan}
      linkedListing={linkedListingOf(plan.listingId, listingSource.list)}
      view={view}
      onViewChange={handleViewChange}
      isPrivacyMode={isPrivacyMode}
      onPrivacyToggle={() => privacyModeStore.set(!isPrivacyMode)}
      onSettingsOpen={(button, isBudget) =>
        sheet.open({ name: "settings", planId: plan.id, isBudget }, button)
      }
      onLineOpen={(row, button) =>
        sheet.open({ name: "line", planId: plan.id, rowKey: row.key, trade: "" }, button)
      }
      onLineAdd={(trade, button) =>
        sheet.open({ name: "line", planId: plan.id, rowKey: null, trade: trade ?? "" }, button)
      }
      onConfirmWrite={(item, quoteId, isConfirmed) =>
        source.updateItem(
          plan.id,
          item.id,
          toggleLineConfirmInput(item, quoteId, isConfirmed),
          item.updatedAt,
        )
      }
    />
  );

  const renderBody = () => {
    // 출처가 정해지기 전에는 로컬 계획을 먼저 그리지 않는다(서버 계획으로 바뀌며 깜빡이지 않게).
    if (list.status === "loading") {
      return (
        <p className={styles.notice} aria-busy="true">
          {planImport.state?.status === "running"
            ? "이 기기의 인테리어 계획을 계정으로 옮기는 중"
            : "인테리어 계획을 불러오는 중"}
        </p>
      );
    }
    // 위쪽 안내가 [다시 시도]를 보인다. 로컬 계획으로 대신 보이지 않는다.
    if (list.status === "accountError") return null;
    if (list.status === "loadFailed") {
      return (
        <div className={styles.notice}>
          <p role="alert">인테리어 계획을 불러오지 못했습니다</p>
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
      return <CorruptPlansNotice rawText={list.rawText} onReset={source.reset} />;
    }
    // 매물 카드에서 왔다: 연결 계획으로 가거나 만들기 시트를 열 때까지 고르기·빈 상태를 먼저 그리지 않는다.
    if (listingId !== undefined) {
      return (
        <p className={styles.notice} aria-busy="true">
          매물을 확인하는 중
        </p>
      );
    }
    if (currentPlan !== null) return renderPlan(currentPlan);
    if (planId !== undefined) {
      return (
        <StatusPanel
          title="계획을 찾을 수 없습니다"
          description={
            source.status === "loggedIn"
              ? "삭제되었거나 이 계정에서 볼 수 없는 계획입니다"
              : "삭제되었거나 이 기기에 없는 계획입니다"
          }
        >
          <a className={styles.panelLink} href={PATHS.home()}>
            우리 집으로
          </a>
        </StatusPanel>
      );
    }
    const openCreate = (button: HTMLButtonElement) =>
      sheet.open({ name: "create", listing: null }, button);
    if (plans.length === 0) return <HomeEmpty onCreate={openCreate} />;
    return <PlanPicker plans={plans} onCreate={openCreate} />;
  };

  // 시트가 열린 동안 뒤 화면은 inert로 키보드·보조기기에서 빼낸다(aria-modal이 약속하는 동작).
  return (
    <>
      <div className={styles.page} inert={sheet.isOpen}>
        {(currentPlan === null || listingId !== undefined) && (
          <h1 className={styles.title}>우리 집</h1>
        )}
        <HomeNotices
          isSessionExpired={source.isSessionExpired}
          isAccountError={source.status === "error"}
          onAccountRetry={source.retry}
          isAccountRetrying={source.isRetrying}
          importProblem={importProblem}
          onImportRetry={planImport.retry}
          isRefreshFailed={source.isRefreshFailed}
          notice={shownNotice}
        />
        {renderBody()}
      </div>
      {renderSheet()}
    </>
  );
}

export default MortgageHome;
