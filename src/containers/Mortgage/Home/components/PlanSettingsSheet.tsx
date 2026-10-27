import { useEffect, useRef, useState, type FormEvent } from "react";

import AmountInput from "@/components/AmountInput";
import Sheet from "@/components/Sheet";
import {
  INTERIOR_PLAN_MAX_COUNT,
  INTERIOR_PLAN_NAME_MAX_LENGTH,
  PLAN_BUDGET_MIN_WON,
} from "@/lib/constants/interiorPlan";
import { validateWonAmount } from "@/lib/utils/amount";
import { planBudgetWonOf } from "@/lib/utils/interiorPlanRows";
import { interiorPlanNameError } from "@/lib/utils/interiorTextErrors";
import { countChars } from "@/lib/utils/validateListingName";

import styles from "./SheetForm.module.css";
import { planSettingsPatch } from "../planSettingsPatch";
import { planWriteFailureMessage, PLAN_LIMIT_MESSAGE } from "../planWriteFailure";

import type { InteriorPlanPatch, InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { InteriorPlanSourceWriteResult } from "@/lib/types/interiorPlanStore";

type PlanSettingsSheetProps = {
  plan: InteriorPlanWithItems;
  planCount: number;
  /** [총 예산 입력]으로 열었으면 예산 칸에서 시작한다 */
  focusBudget: boolean;
  /** 성공하면 부르는 쪽이 닫는다 */
  onSave: (patch: InteriorPlanPatch) => Promise<InteriorPlanSourceWriteResult>;
  /** 시트가 확인한 뒤 부른다. 성공하면 부르는 쪽이 닫고 `#/home`으로 간다 */
  onDelete: () => Promise<InteriorPlanSourceWriteResult>;
  /** 매물 연결 해제(PATCH `listingId: null`). 시트는 열어 둔다(고치던 이름·예산을 잃지 않게) */
  onUnlinkListing: () => Promise<InteriorPlanSourceWriteResult>;
  onCreateAnother: () => void;
  onClose: () => void;
};

const NAME_INPUT_ID = "interior-plan-settings-name";
const NAME_COUNT_ID = "interior-plan-settings-name-count";
const NAME_ERROR_ID = "interior-plan-settings-name-error";
const BUDGET_INPUT_ID = "interior-plan-settings-budget";
const DISCARD_CONFIRM_MESSAGE = "고친 내용을 버리고 닫을까요?";

function budgetErrorOf(raw: string): string | null {
  const validation = validateWonAmount(raw, PLAN_BUDGET_MIN_WON);
  return validation.status === "error" ? validation.message : null;
}

/**
 * 계획 관리(⋯): 이름·총 예산 바꾸기, 매물 연결 해제(연결돼 있을 때만), 다른 계획 만들기, 이 계획 삭제.
 * 저장은 바뀐 칸만 보낸다(`planSettingsPatch`). 총 예산을 비우고 저장하면 지운다.
 */
function PlanSettingsSheet({
  plan,
  planCount,
  focusBudget,
  onSave,
  onDelete,
  onUnlinkListing,
  onCreateAnother,
  onClose,
}: PlanSettingsSheetProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  // 총 예산은 원 글자로 채운다(옛 만원 `budget`도 `planBudgetWonOf`가 원으로 읽은 값)
  const [initialFields] = useState(() => {
    const budgetWon = planBudgetWonOf(plan);
    return { name: plan.name, budget: budgetWon === undefined ? "" : String(budgetWon) };
  });
  const [name, setName] = useState(initialFields.name);
  const [budget, setBudget] = useState(initialFields.budget);
  const [nameError, setNameError] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUnlinked, setIsUnlinked] = useState(false);
  const isLinked = plan.listingId !== undefined;
  const patch = planSettingsPatch(initialFields, { name, budget });
  const isChanged = Object.keys(patch).length > 0;
  const canCreateAnother = planCount < INTERIOR_PLAN_MAX_COUNT;

  // 시트가 먼저 자기에게 포커스를 둔 뒤(자식 effect가 먼저 돈다) 예산 칸으로 옮긴다.
  useEffect(() => {
    if (focusBudget) document.getElementById(BUDGET_INPUT_ID)?.focus();
  }, [focusBudget]);

  const handleClose = () => {
    if (!isChanged || window.confirm(DISCARD_CONFIRM_MESSAGE)) onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    const nextNameError = interiorPlanNameError(name);
    const nextBudgetError = budgetErrorOf(budget);
    setNameError(nextNameError);
    setBudgetError(nextBudgetError);
    if (nextNameError !== null) {
      nameInputRef.current?.focus();
      return;
    }
    if (nextBudgetError !== null) {
      document.getElementById(BUDGET_INPUT_ID)?.focus();
      return;
    }
    setIsSaving(true);
    const result = await onSave(patch);
    setIsSaving(false);
    setWriteError(result.ok ? null : planWriteFailureMessage(result.reason));
  };

  const handleDelete = async () => {
    const message = `'${plan.name}' 계획을 삭제할까요? 항목 ${plan.items.length}개도 함께 지워지고 되돌릴 수 없습니다.`;
    if (!window.confirm(message)) return;
    const result = await onDelete();
    if (!result.ok) setWriteError(planWriteFailureMessage(result.reason));
  };

  const handleUnlink = async () => {
    const message =
      "매물 연결을 해제할까요? 계획과 항목은 그대로 남고, 매물 카드의 [인테리어 계획]은 새 계획 만들기로 열립니다.";
    if (!window.confirm(message)) return;
    const result = await onUnlinkListing();
    setIsUnlinked(result.ok);
    setWriteError(result.ok ? null : planWriteFailureMessage(result.reason));
  };

  return (
    <Sheet title="계획 관리" onClose={handleClose}>
      <form className={styles.form} noValidate onSubmit={handleSubmit}>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className={styles.label} htmlFor={NAME_INPUT_ID}>
              계획 이름
            </label>
            <span id={NAME_COUNT_ID} className={styles.count}>
              {countChars(name.trim())}/{INTERIOR_PLAN_NAME_MAX_LENGTH}
            </span>
          </div>
          <input
            ref={nameInputRef}
            id={NAME_INPUT_ID}
            className={styles.input}
            type="text"
            autoComplete="off"
            enterKeyHint="next"
            autoFocus={!focusBudget}
            value={name}
            aria-invalid={nameError !== null}
            aria-describedby={
              nameError === null ? NAME_COUNT_ID : `${NAME_COUNT_ID} ${NAME_ERROR_ID}`
            }
            onChange={(event) => {
              setName(event.target.value);
              if (interiorPlanNameError(event.target.value) === null) setNameError(null);
            }}
            onBlur={() => setNameError(interiorPlanNameError(name))}
          />
          {nameError !== null && (
            <p id={NAME_ERROR_ID} className={styles.error}>
              {nameError}
            </p>
          )}
        </div>
        <AmountInput
          id={BUDGET_INPUT_ID}
          label="총 예산(선택)"
          unit="won"
          value={budget}
          error={budgetError}
          onChange={(value) => {
            setBudget(value);
            if (budgetErrorOf(value) === null) setBudgetError(null);
          }}
          onBlur={() => setBudgetError(budgetErrorOf(budget))}
        />
        {writeError !== null && (
          <p role="alert" className={styles.error}>
            {writeError}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={handleClose}>
            취소
          </button>
          <button type="submit" className={styles.primaryButton} disabled={!isChanged || isSaving}>
            저장
          </button>
        </div>
        <div className={styles.section}>
          {isLinked && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleUnlink()}
            >
              매물 연결 해제
            </button>
          )}
          {isUnlinked && !isLinked && (
            <p role="status" className={styles.note}>
              매물 연결을 해제했습니다
            </p>
          )}
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!canCreateAnother}
            onClick={onCreateAnother}
          >
            다른 계획 만들기
          </button>
          {!canCreateAnother && <p className={styles.limitNote}>{PLAN_LIMIT_MESSAGE}</p>}
          <button type="button" className={styles.dangerButton} onClick={() => void handleDelete()}>
            이 계획 삭제
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export default PlanSettingsSheet;
