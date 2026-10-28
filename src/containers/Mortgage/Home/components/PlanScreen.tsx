import { useState } from "react";

import ChoiceGroup from "@/components/ChoiceGroup";
import { INTERIOR_ITEM_MAX_COUNT } from "@/lib/constants/interiorPlan";
import { buildInteriorPlanRows, summarizeInteriorPlan } from "@/lib/utils/interiorPlanRows";
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
  /** 이 계획의 줄 순서(`lineOrder`)를 저장한다(플랜 PATCH 한 번, 출처는 모른다) */
  onLineOrderWrite: (lineOrder: string[]) => Promise<InteriorPlanSourceWriteResult>;
};

/** 저장 중인 줄 순서. 계획 id와 묶는다(이 화면은 계획이 바뀌어도 같은 인스턴스라 다른 계획에 새지 않게) */
type PendingLineOrder = { planId: string; lineOrder: string[] };

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
 * 플랜 화면: 머리글(이름과 같은 줄 오른쪽 [⋯], 아래 연결 매물) → 요약 → [목록|표] → (목록) 공정별 목록 + 떠 있는 [+](줄 추가) / (표) 표 보기.
 * 체크와 요약은 같은 계획 값에서 매번 계산한다(ADR-007). `now`는 렌더마다 하나만 만들어 표 머리·파일 이름이 같이 쓴다.
 * 끌어 놓은 줄 순서는 저장이 끝날 때까지 이 화면이 들고 있어 목록·표가 같은 순서를 보인다(저장 중 [표]로 바꿔도 같다).
 * 저장이 끝나면(성공이면 캐시·로컬 스냅샷에 새 순서가 들어간 뒤) 풀고, 실패면 원래 순서로 돌아온다.
 */
function PlanScreen({
  plan,
  linkedListing,
  view,
  onViewChange,
  onSettingsOpen,
  onLineOpen,
  onLineAdd,
  onConfirmWrite,
  onLineOrderWrite,
}: PlanScreenProps) {
  const [pending, setPending] = useState<PendingLineOrder | null>(null);
  const pendingLineOrder = pending?.planId === plan.id ? pending.lineOrder : null;
  const now = new Date();
  const summary = summarizeInteriorPlan(plan);
  const rows = buildInteriorPlanRows({
    items: plan.items,
    lineOrder: pendingLineOrder ?? plan.lineOrder,
  });
  const canAddLine = plan.items.length < INTERIOR_ITEM_MAX_COUNT;

  const handleReorder = async (lineOrder: string[]) => {
    const saving = { planId: plan.id, lineOrder };
    setPending(saving);
    const result = await onLineOrderWrite(lineOrder);
    setPending((current) => (current === saving ? null : current));
    return result;
  };

  return (
    <>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{plan.name}</h1>
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
        <LinkedListingLine linkedListing={linkedListing} />
      </header>
      <PlanSummary summary={summary} onBudgetEdit={(button) => onSettingsOpen(button, true)} />
      <ChoiceGroup
        name="interiorPlanView"
        legend="보기"
        options={VIEW_OPTIONS}
        value={view}
        columns={VIEW_OPTIONS.length}
        isOnBackground
        onChange={onViewChange}
      />
      {view === "table" ? (
        <PlanTableView
          planName={plan.name}
          rows={rows}
          summary={summary}
          today={toLocalDateString(now)}
        />
      ) : (
        // 계획을 바꾸면 안내 줄·든 줄을 새로 시작한다
        <PlanLines
          key={plan.id}
          groups={rows.groups}
          canAddLine={canAddLine}
          canReorder={pendingLineOrder === null}
          onReorder={handleReorder}
          onLineAdd={onLineAdd}
          onLineOpen={onLineOpen}
          onConfirmWrite={onConfirmWrite}
        />
      )}
    </>
  );
}

export default PlanScreen;
