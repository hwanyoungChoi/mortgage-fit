import { useEffect, useRef, useState, type FormEvent } from "react";

import AmountInput from "@/components/AmountInput";
import Sheet from "@/components/Sheet";
import {
  INTERIOR_PLAN_MAX_COUNT,
  INTERIOR_PLAN_NAME_MAX_LENGTH,
} from "@/lib/constants/interiorPlan";
import { validateAmount } from "@/lib/utils/amount";
import { interiorPlanNameError } from "@/lib/utils/interiorTextErrors";
import { countChars } from "@/lib/utils/validateListingName";

import styles from "./SheetForm.module.css";
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
  onCreateAnother: () => void;
  onClose: () => void;
};

const NAME_INPUT_ID = "interior-plan-settings-name";
const NAME_COUNT_ID = "interior-plan-settings-name-count";
const NAME_ERROR_ID = "interior-plan-settings-name-error";
const BUDGET_INPUT_ID = "interior-plan-settings-budget";
const DISCARD_CONFIRM_MESSAGE = "고친 내용을 버리고 닫을까요?";

function budgetErrorOf(raw: string): string | null {
  const validation = validateAmount(raw);
  return validation.status === "error" ? validation.message : null;
}

/** 계획 관리(⋯): 이름·총 예산 바꾸기, 다른 계획 만들기, 이 계획 삭제. 총 예산을 비우고 저장하면 지운다. */
function PlanSettingsSheet({
  plan,
  planCount,
  focusBudget,
  onSave,
  onDelete,
  onCreateAnother,
  onClose,
}: PlanSettingsSheetProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const initialBudget = plan.budget === undefined ? "" : String(plan.budget);
  const [name, setName] = useState(plan.name);
  const [budget, setBudget] = useState(initialBudget);
  const [nameError, setNameError] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isChanged = name !== plan.name || budget !== initialBudget;
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
    const budgetValidation = validateAmount(budget);
    setIsSaving(true);
    const result = await onSave({
      name: name.trim(),
      budget: budgetValidation.status === "valid" ? budgetValidation.value : null,
    });
    setIsSaving(false);
    setWriteError(result.ok ? null : planWriteFailureMessage(result.reason));
  };

  const handleDelete = async () => {
    const message = `'${plan.name}' 계획을 삭제할까요? 항목 ${plan.items.length}개도 함께 지워지고 되돌릴 수 없습니다.`;
    if (!window.confirm(message)) return;
    const result = await onDelete();
    if (!result.ok) setWriteError(planWriteFailureMessage(result.reason));
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
