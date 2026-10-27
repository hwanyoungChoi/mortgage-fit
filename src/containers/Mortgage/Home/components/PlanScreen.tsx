import ChoiceGroup from "@/components/ChoiceGroup";
import { INTERIOR_ITEM_MAX_COUNT } from "@/lib/constants/interiorPlan";
import { summarizeInteriorPlan } from "@/lib/utils/summarizeInteriorPlan";

import ItemGroups from "./ItemGroups";
import styles from "./PlanScreen.module.css";
import PlanSummary from "./PlanSummary";
import PlanTodos from "./PlanTodos";
import { ITEM_LIMIT_MESSAGE } from "../planWriteFailure";

import type { LinkedListing } from "../linkedListing";
import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { HomeView } from "@/lib/types/route";

type PlanScreenProps = {
  plan: InteriorPlanWithItems;
  /** 연결된 매물. 매물 목록이 확정 로드되기 전(unknown)에는 아무것도 보이지 않는다 */
  linkedListing: LinkedListing;
  view: HomeView;
  onViewChange: (view: HomeView) => void;
  isPrivacyMode: boolean;
  onPrivacyToggle: () => void;
  onSpacesOpen: (button: HTMLButtonElement) => void;
  onProcessOpen: (button: HTMLButtonElement) => void;
  /** `isBudget`면 [총 예산 입력]으로 열었다(예산 칸에서 시작) */
  onSettingsOpen: (button: HTMLButtonElement, isBudget: boolean) => void;
  onItemOpen: (itemId: string, button: HTMLButtonElement) => void;
  /** `spaceId`가 null이면 첫 공간으로 채운다 */
  onItemAdd: (spaceId: string | null, button: HTMLButtonElement) => void;
};

const VIEW_OPTIONS: { value: HomeView; label: string }[] = [
  { value: "space", label: "공간별" },
  { value: "trade", label: "공종별" },
];

/** 제목 아래 한 줄: 연결된 매물 이름(작게) 또는 연결 끊김. 플랜은 그대로다(AC-6) */
function LinkedListingLine({ linkedListing }: { linkedListing: LinkedListing }) {
  if (linkedListing.status === "linked") {
    return <p className={styles.linkedListing}>연결된 매물 · {linkedListing.listing.name}</p>;
  }
  if (linkedListing.status === "missing") {
    return <p className={styles.linkedListingMissing}>연결된 매물이 삭제되었습니다</p>;
  }
  return null;
}

/**
 * 플랜 화면: 머리글(이름 + [공간 편집][공정 순서][가리기][⋯]) → 요약 → 할 일 → [공간별|공종별] → [항목 추가] → 묶음 목록.
 * [항목 추가]는 목록 위에 두어 항목 수와 상관없이 같은 자리에 있다.
 */
function PlanScreen({
  plan,
  linkedListing,
  view,
  onViewChange,
  isPrivacyMode,
  onPrivacyToggle,
  onSpacesOpen,
  onProcessOpen,
  onSettingsOpen,
  onItemOpen,
  onItemAdd,
}: PlanScreenProps) {
  const summary = summarizeInteriorPlan(plan, new Date());
  const groups = view === "space" ? summary.spaceGroups : summary.tradeGroups;
  const canAddItem = plan.items.length < INTERIOR_ITEM_MAX_COUNT;

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>{plan.name}</h1>
        <LinkedListingLine linkedListing={linkedListing} />
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.headerButton}
            aria-haspopup="dialog"
            onClick={(event) => onSpacesOpen(event.currentTarget)}
          >
            공간 편집
          </button>
          <button
            type="button"
            className={styles.headerButton}
            aria-haspopup="dialog"
            onClick={(event) => onProcessOpen(event.currentTarget)}
          >
            공정 순서
          </button>
          {/* 켜짐은 aria-pressed와 채운 색으로 보인다(저장 목록의 [가리기]와 같은 설정이다). */}
          <button
            type="button"
            className={styles.privacyButton}
            aria-pressed={isPrivacyMode}
            onClick={onPrivacyToggle}
          >
            가리기
          </button>
          <button
            type="button"
            className={styles.headerButton}
            aria-label="계획 관리"
            aria-haspopup="dialog"
            onClick={(event) => onSettingsOpen(event.currentTarget, false)}
          >
            ⋯
          </button>
        </div>
      </header>
      <PlanSummary
        summary={summary}
        isMasked={isPrivacyMode}
        onBudgetEdit={(button) => onSettingsOpen(button, true)}
      />
      <PlanTodos summary={summary} isMasked={isPrivacyMode} onItemOpen={onItemOpen} />
      <ChoiceGroup
        name="interiorPlanView"
        legend="목록 보기"
        options={VIEW_OPTIONS}
        value={view}
        columns={VIEW_OPTIONS.length}
        onChange={onViewChange}
      />
      <div className={styles.addRow}>
        <button
          type="button"
          className={styles.addButton}
          aria-haspopup="dialog"
          disabled={!canAddItem}
          onClick={(event) => onItemAdd(null, event.currentTarget)}
        >
          항목 추가
        </button>
        {!canAddItem && <p className={styles.limitNote}>{ITEM_LIMIT_MESSAGE}</p>}
      </div>
      {groups.length === 0 ? (
        <p className={styles.emptyItems}>
          아직 항목이 없습니다. [항목 추가]로 공간·공종별 예산과 견적을 적어 보세요
        </p>
      ) : (
        <ItemGroups
          groups={groups}
          view={view}
          isMasked={isPrivacyMode}
          onItemOpen={onItemOpen}
          onAddToSpace={(spaceId, button) => onItemAdd(spaceId, button)}
          canAddItem={canAddItem}
        />
      )}
    </>
  );
}

export default PlanScreen;
