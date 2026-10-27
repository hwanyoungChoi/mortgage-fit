import ChoiceGroup from "@/components/ChoiceGroup";
import { INTERIOR_ITEM_MAX_COUNT } from "@/lib/constants/interiorPlan";
import { buildInteriorPlanRows, summarizeInteriorPlan } from "@/lib/utils/interiorPlanRows";
import { summarizeInteriorPlan as summarizeForTable } from "@/lib/utils/summarizeInteriorPlan";
import { toLocalDateString } from "@/lib/utils/toLocalDateString";

import PlanLines from "./PlanLines";
import styles from "./PlanScreen.module.css";
import PlanSummary from "./PlanSummary";
import PlanTableView from "./PlanTableView";

import type { LinkedListing } from "../linkedListing";
import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { InteriorPlanSourceWriteResult } from "@/lib/types/interiorPlanStore";
import type { HomeView } from "@/lib/types/route";
import type { InteriorPlanRow } from "@/lib/utils/interiorPlanRows";

type PlanScreenProps = {
  plan: InteriorPlanWithItems;
  /** 연결된 매물. 매물 목록이 확정 로드되기 전(unknown)에는 아무것도 보이지 않는다 */
  linkedListing: LinkedListing;
  view: HomeView;
  onViewChange: (view: HomeView) => void;
  isPrivacyMode: boolean;
  onPrivacyToggle: () => void;
  /** `isBudget`면 [총 예산 입력]으로 열었다(예산 칸에서 시작) */
  onSettingsOpen: (button: HTMLButtonElement, isBudget: boolean) => void;
  onLineOpen: (row: InteriorPlanRow, button: HTMLButtonElement) => void;
  /** `trade`가 있으면 그 구분을 채운 새 줄 */
  onLineAdd: (trade: string | null, button: HTMLButtonElement) => void;
  /** 목록의 [확정] 체크. 그 줄 항목의 확정만 바꿔 저장한다 */
  onConfirmWrite: (
    item: InteriorItem,
    quoteId: string,
    isConfirmed: boolean,
  ) => Promise<InteriorPlanSourceWriteResult>;
};

const VIEW_OPTIONS: { value: HomeView; label: string }[] = [
  { value: "list", label: "목록" },
  { value: "table", label: "표" },
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
 * 플랜 화면: 머리글(이름 + [가리기][⋯]) → 요약 → [목록|표] → (목록) [줄 추가] + 공정별 목록 / (표) 표 보기.
 * 체크와 요약은 같은 계획 값에서 매번 계산한다(ADR-007). `now`는 렌더마다 하나만 만들어 표 머리·파일 이름이 같이 쓴다.
 */
function PlanScreen({
  plan,
  linkedListing,
  view,
  onViewChange,
  isPrivacyMode,
  onPrivacyToggle,
  onSettingsOpen,
  onLineOpen,
  onLineAdd,
  onConfirmWrite,
}: PlanScreenProps) {
  const now = new Date();
  const summary = summarizeInteriorPlan(plan);
  const { groups } = buildInteriorPlanRows(plan);
  const canAddLine = plan.items.length < INTERIOR_ITEM_MAX_COUNT;

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>{plan.name}</h1>
        <LinkedListingLine linkedListing={linkedListing} />
        <div className={styles.headerActions}>
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
      <ChoiceGroup
        name="interiorPlanView"
        legend="보기"
        options={VIEW_OPTIONS}
        value={view}
        columns={VIEW_OPTIONS.length}
        onChange={onViewChange}
      />
      {view === "table" ? (
        <PlanTableView
          planName={plan.name}
          summary={summarizeForTable(plan, now)}
          today={toLocalDateString(now)}
          isPrivacyMode={isPrivacyMode}
        />
      ) : (
        <PlanLines
          groups={groups}
          isMasked={isPrivacyMode}
          canAddLine={canAddLine}
          onLineAdd={onLineAdd}
          onLineOpen={onLineOpen}
          onConfirmWrite={onConfirmWrite}
        />
      )}
    </>
  );
}

export default PlanScreen;
