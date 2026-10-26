import { useSyncExternalStore } from "react";

import Sheet from "@/components/Sheet";
import StatusPanel from "@/components/StatusPanel";
import { useOpenSheet } from "@/hooks/useOpenSheet";
import { PATHS } from "@/lib/constants/paths";

import styles from "./MortgageHome.module.css";
import CorruptPlansNotice from "./components/CorruptPlansNotice";
import CreatePlanSheet from "./components/CreatePlanSheet";
import HomeEmpty from "./components/HomeEmpty";
import ItemSheet from "./components/ItemSheet";
import PlanPicker from "./components/PlanPicker";
import PlanScreen from "./components/PlanScreen";
import PlanSettingsSheet from "./components/PlanSettingsSheet";
import ProcessSheet from "./components/ProcessSheet";
import SpacesSheet from "./components/SpacesSheet";
import { useInteriorPlanSource } from "./hooks/useInteriorPlanSource";

import type { InteriorPlanCreateInput, InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { InteriorPlanStore } from "@/lib/types/interiorPlanStore";
import type { PrivacyModeStore } from "@/lib/types/privacyMode";
import type { HomeView } from "@/lib/types/route";

type MortgageHomeProps = {
  /** 로그아웃 상태의 플랜 원본(새 키 하나만 쓴다) */
  interiorPlanStore: InteriorPlanStore;
  /** 저장 목록과 같은 가리기 설정. 켜면 금액·연락처·메모를 그리지 않는다 */
  privacyModeStore: PrivacyModeStore;
  /** 주소의 플랜 id(`#/home/{planId}`). 없으면 플랜 수로 화면을 고른다 */
  planId: string | undefined;
  view: HomeView;
};

/** [우리 집] 화면의 시트(한 번에 하나, ADR-017) */
type HomeSheet =
  | { name: "create" }
  | { name: "spaces"; planId: string }
  | { name: "process" }
  | { name: "settings"; planId: string; isBudget: boolean }
  | { name: "item"; planId: string; itemId: string | null; spaceId: string | null };

const UNAVAILABLE_MESSAGE =
  "이 브라우저에서는 저장소를 사용할 수 없어 인테리어 계획을 쓸 수 없습니다";

/** 열어 둔 시트의 계획·항목이 다른 탭에서 지워졌을 때 */
function MissingSheet({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <Sheet title="찾을 수 없습니다" onClose={onClose}>
      <p>{message}</p>
    </Sheet>
  );
}

/**
 * 우리 집: 계약한 집의 인테리어 예산·견적·지급(스펙 interior-planner). 합계·할 일은 저장하지 않고 매번 계산한다(ADR-007).
 * `#/home`은 플랜 0개면 빈 상태, 1개면 그 플랜, 2~3개면 고르기다. 공간별·공종별 보기는 주소(`?view=trade`)에 둔다.
 */
function MortgageHome({ interiorPlanStore, privacyModeStore, planId, view }: MortgageHomeProps) {
  const source = useInteriorPlanSource(interiorPlanStore);
  const { snapshot } = source;
  const isPrivacyMode = useSyncExternalStore(
    privacyModeStore.subscribe,
    privacyModeStore.getSnapshot,
  );
  const sheet = useOpenSheet<HomeSheet>();
  const plans = snapshot.status === "ok" ? snapshot.plans : [];
  const findPlan = (id: string) => plans.find((plan) => plan.id === id) ?? null;

  /** 주소에 플랜이 있으면 그 플랜, 없으면 하나뿐일 때 그 플랜 */
  const currentPlan =
    planId === undefined ? (plans.length === 1 ? plans[0] : null) : findPlan(planId);

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
      return <CreatePlanSheet onCreate={handleCreate} onClose={sheet.close} />;
    }
    if (openSheet.name === "process") return <ProcessSheet onClose={sheet.close} />;
    const plan = findPlan(openSheet.planId);
    // 다른 탭에서 플랜을 지웠다. 시트를 닫을 수 있게만 둔다(뒤 화면의 inert가 풀리도록).
    if (plan === null)
      return <MissingSheet message="다른 탭에서 삭제된 계획입니다" onClose={sheet.close} />;
    if (openSheet.name === "spaces") {
      return (
        <SpacesSheet
          plan={plan}
          onSave={async (spaces) => {
            const result = await source.updatePlan(plan.id, { spaces });
            if (result.ok) sheet.close();
            return result;
          }}
          onClose={sheet.close}
        />
      );
    }
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
          onCreateAnother={() => sheet.open({ name: "create" }, null)}
          onClose={sheet.close}
        />
      );
    }
    const item =
      openSheet.itemId === null
        ? null
        : (plan.items.find((candidate) => candidate.id === openSheet.itemId) ?? null);
    // 고치던 항목을 다른 탭에서 지웠다. 새 항목으로 저장되지 않게 시트를 바꾼다.
    if (openSheet.itemId !== null && item === null) {
      return <MissingSheet message="다른 탭에서 삭제된 항목입니다" onClose={sheet.close} />;
    }
    return (
      <ItemSheet
        plan={plan}
        item={item}
        initialSpaceId={openSheet.spaceId ?? plan.spaces[0].id}
        onSave={async (input) => {
          const result =
            item === null
              ? await source.addItem(plan.id, input)
              : await source.updateItem(plan.id, item.id, input);
          if (result.ok) sheet.close();
          return result;
        }}
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
      view={view}
      onViewChange={handleViewChange}
      isPrivacyMode={isPrivacyMode}
      onPrivacyToggle={() => privacyModeStore.set(!isPrivacyMode)}
      onSpacesOpen={(button) => sheet.open({ name: "spaces", planId: plan.id }, button)}
      onProcessOpen={(button) => sheet.open({ name: "process" }, button)}
      onSettingsOpen={(button, isBudget) =>
        sheet.open({ name: "settings", planId: plan.id, isBudget }, button)
      }
      onItemOpen={(itemId, button) =>
        sheet.open({ name: "item", planId: plan.id, itemId, spaceId: null }, button)
      }
      onItemAdd={(spaceId, button) =>
        sheet.open({ name: "item", planId: plan.id, itemId: null, spaceId }, button)
      }
    />
  );

  const renderBody = () => {
    if (snapshot.status === "unavailable") {
      return <p className={styles.notice}>{UNAVAILABLE_MESSAGE}</p>;
    }
    if (snapshot.status === "corrupt") {
      return <CorruptPlansNotice rawText={snapshot.rawText} onReset={source.reset} />;
    }
    if (currentPlan !== null) return renderPlan(currentPlan);
    if (planId !== undefined) {
      return (
        <StatusPanel
          title="계획을 찾을 수 없습니다"
          description="삭제되었거나 이 기기에 없는 계획입니다"
        >
          <a className={styles.panelLink} href={PATHS.home()}>
            우리 집으로
          </a>
        </StatusPanel>
      );
    }
    const openCreate = (button: HTMLButtonElement) => sheet.open({ name: "create" }, button);
    if (plans.length === 0) return <HomeEmpty onCreate={openCreate} />;
    return <PlanPicker plans={plans} onCreate={openCreate} />;
  };

  // 시트가 열린 동안 뒤 화면은 inert로 키보드·보조기기에서 빼낸다(aria-modal이 약속하는 동작).
  return (
    <>
      <div className={styles.page} inert={sheet.isOpen}>
        {currentPlan === null && <h1 className={styles.title}>우리 집</h1>}
        {renderBody()}
      </div>
      {renderSheet()}
    </>
  );
}

export default MortgageHome;
