import { useRef, useState, type FormEvent } from "react";

import AmountInput from "@/components/AmountInput";
import Sheet from "@/components/Sheet";
import { INTERIOR_PLAN_NAME_MAX_LENGTH, PLAN_BUDGET_MIN_WON } from "@/lib/constants/interiorPlan";
import { INTERIOR_WHOLE_SPACE_NAME } from "@/lib/constants/interiorSpaces";
import { validateWonAmount } from "@/lib/utils/amount";
import { createRandomId } from "@/lib/utils/createRandomId";
import {
  extraCostsBudgetWon,
  extraCostsToInteriorItems,
  interiorExtraCostsOf,
} from "@/lib/utils/extraCostsToInteriorItems";
import { interiorPlanNameError } from "@/lib/utils/interiorTextErrors";
import { countChars } from "@/lib/utils/validateListingName";

import styles from "./SheetForm.module.css";
import { planWriteFailureMessage, PLAN_LIMIT_MESSAGE } from "../planWriteFailure";

import type { InteriorPlanCreateInput } from "@/lib/types/interiorPlan";
import type { InteriorPlanSourceWriteFailure } from "@/lib/types/interiorPlanStore";
import type { Listing } from "@/lib/types/listing";

type CreatePlanSheetProps = {
  /** 성공하면 부르는 쪽이 시트를 닫고 그 플랜으로 간다. 실패하면 입력을 그대로 두고 이유를 보인다. */
  onCreate: (
    input: InteriorPlanCreateInput,
  ) => Promise<{ ok: true } | InteriorPlanSourceWriteFailure>;
  /** 매물 카드에서 왔으면 그 매물(`#/home?listing=`). 이름·총 예산을 채우고 추가 비용 인테리어 줄을 가져올 수 있다 */
  listing: Listing | null;
  onClose: () => void;
};

const NAME_INPUT_ID = "interior-plan-name";
const NAME_COUNT_ID = "interior-plan-name-count";
const NAME_ERROR_ID = "interior-plan-name-error";
const BUDGET_INPUT_ID = "interior-plan-budget";
const IMPORT_NOTE_ID = "interior-plan-import-note";

function budgetErrorOf(raw: string): string | null {
  const validation = validateWonAmount(raw, PLAN_BUDGET_MIN_WON);
  return validation.status === "error" ? validation.message : null;
}

/**
 * 계획 만들기: 이름·총 예산(선택). 공간은 화면에 없고 "전체" 하나로 만든다(저장 형식이 공간 1개 이상을 요구, 스펙 interior-simple U11).
 * 총 예산은 원으로 입력해 `budgetWon`으로 쓴다(ADR-034). 매물에서 왔으면 이름 = 매물 이름, 총 예산 = 추가 비용 인테리어 줄 합계(원)로 채우고, 그 줄이 있으면 "n줄 가져오기"(기본 체크)를 둔다.
 * 가져온 줄은 견적 없는 줄(비고에 예산)이 되고 그 뒤로 매물 추가 비용과 동기화하지 않는다(1회 복사).
 */
function CreatePlanSheet({ onCreate, listing, onClose }: CreatePlanSheetProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const interiorExtraCosts = interiorExtraCostsOf(listing?.extraCosts);
  const importCount = interiorExtraCosts.length;
  const [name, setName] = useState(listing?.name ?? "");
  const [budget, setBudget] = useState(
    importCount === 0 ? "" : String(extraCostsBudgetWon(interiorExtraCosts)),
  );
  const [isImportChecked, setIsImportChecked] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
    const budgetValidation = validateWonAmount(budget, PLAN_BUDGET_MIN_WON);
    const wholeSpaceId = createRandomId();
    const shouldImport = listing !== null && importCount > 0 && isImportChecked;
    setIsSaving(true);
    const result = await onCreate({
      name: name.trim(),
      ...(budgetValidation.status === "valid" && { budgetWon: budgetValidation.value }),
      ...(listing !== null && { listingId: listing.id }),
      spaces: [{ id: wholeSpaceId, name: INTERIOR_WHOLE_SPACE_NAME }],
      ...(shouldImport && { items: extraCostsToInteriorItems(listing.extraCosts, wholeSpaceId) }),
    });
    setIsSaving(false);
    setWriteError(result.ok ? null : planWriteFailureMessage(result.reason, PLAN_LIMIT_MESSAGE));
  };

  return (
    <Sheet title="인테리어 계획 만들기" onClose={onClose}>
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
            placeholder="예: 우리 집"
            autoFocus
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
        {importCount > 0 && (
          <div className={styles.field}>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={isImportChecked}
                aria-describedby={IMPORT_NOTE_ID}
                onChange={(event) => setIsImportChecked(event.target.checked)}
              />
              추가 비용 인테리어 {importCount}줄 가져오기
            </label>
            <p id={IMPORT_NOTE_ID} className={styles.note}>
              줄 이름은 구분, 금액은 비고의 예산으로 넣습니다. 그 뒤로 매물의 추가 비용과는 따로
              관리돼요
            </p>
          </div>
        )}
        {writeError !== null && (
          <p role="alert" className={styles.error}>
            {writeError}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            취소
          </button>
          <button type="submit" className={styles.primaryButton} disabled={isSaving}>
            만들기
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export default CreatePlanSheet;
