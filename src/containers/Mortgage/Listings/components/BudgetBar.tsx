import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import AmountInput from "@/components/AmountInput";
import MaskedValue from "@/components/MaskedValue";
import { formatManwon, validateAmount } from "@/lib/utils/amount";

import styles from "./BudgetBar.module.css";

import type { BudgetSaveFailure, BudgetSaveResult, BudgetState } from "@/lib/types/budget";

type BudgetBarProps = {
  state: BudgetState;
  overBudgetCount: number;
  onSave: (budget: number | null) => Promise<BudgetSaveResult>;
  /** 로그인 상태의 첫 조회·이전 실패를 다시 한다 */
  onRetry: () => void;
  isRetrying: boolean;
  /** 가리기 모드: 예산 금액을 가린다(초과 건수는 그대로) */
  isMasked: boolean;
};

const BUDGET_INPUT_ID = "budget";

function amountErrorOf(raw: string): string | null {
  const validation = validateAmount(raw);
  return validation.status === "error" ? validation.message : null;
}

/** 비운 채 저장하면 예산을 지운다. */
function toBudget(raw: string): number | null {
  const validation = validateAmount(raw);
  return validation.status === "valid" ? validation.value : null;
}

/**
 * 저장 실패 문구. 폼은 닫지 않고 입력값을 남긴다.
 * unauthorized는 로그아웃 상태로 바뀌어 제목 아래 안내가 "로그인이 끝났습니다"로 알리고 예산 줄은 기기 예산이 된다(폼을 닫는다).
 */
const SAVE_FAILURE_MESSAGES: Record<BudgetSaveFailure["reason"], string | null> = {
  network: "예산을 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요",
  notReady: "계정 상태를 확인한 뒤 다시 시도해 주세요",
  unauthorized: null,
};

type BudgetFormProps = {
  budget: number | null;
  onSave: (budget: number | null) => Promise<BudgetSaveResult>;
  onClose: () => void;
};

function BudgetForm({ budget, onSave, onClose }: BudgetFormProps) {
  const [value, setValue] = useState(budget === null ? "" : String(budget));
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isUnchanged = toBudget(value) === budget && amountErrorOf(value) === null;

  useEffect(() => {
    document.getElementById(BUDGET_INPUT_ID)?.focus();
  }, []);

  const handleChange = (raw: string) => {
    setValue(raw);
    if (amountErrorOf(raw) === null) setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextError = amountErrorOf(value);
    if (nextError !== null) {
      setError(nextError);
      document.getElementById(BUDGET_INPUT_ID)?.focus();
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    const result = await onSave(toBudget(value));
    setIsSaving(false);
    if (result.ok) {
      onClose();
      return;
    }
    const message = SAVE_FAILURE_MESSAGES[result.reason];
    if (message === null) onClose();
    else setSaveError(message);
  };

  return (
    <form className={styles.form} noValidate onSubmit={(event) => void handleSubmit(event)}>
      <AmountInput
        id={BUDGET_INPUT_ID}
        label="내 예산(비우고 저장하면 지움)"
        value={value}
        error={error}
        onChange={handleChange}
        onBlur={() => setError(amountErrorOf(value))}
      />
      <div className={styles.formActions}>
        <button type="button" className={styles.secondaryButton} onClick={onClose}>
          취소
        </button>
        <button type="submit" className={styles.primaryButton} disabled={isUnchanged || isSaving}>
          저장
        </button>
      </div>
      {saveError !== null && (
        <p role="alert" className={styles.saveError}>
          {saveError}
        </p>
      )}
    </form>
  );
}

/**
 * 저장 목록 위의 내 예산. 예산이 있으면 필요한 자기자금이 예산을 넘는 매물 수를 함께 보인다.
 * 로그인 상태에서 불러오는 중이거나 실패하면 기기 예산으로 대신 보이지 않는다.
 */
function BudgetBar({
  state,
  overBudgetCount,
  onSave,
  onRetry,
  isRetrying,
  isMasked,
}: BudgetBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const budget = state.status === "ok" ? state.budget : null;

  if (isEditing && state.status === "ok") {
    return (
      <section className={styles.formBar} aria-label="내 예산">
        <BudgetForm budget={budget} onSave={onSave} onClose={() => setIsEditing(false)} />
      </section>
    );
  }

  const rows: Record<BudgetState["status"], () => ReactNode> = {
    // 한 줄: 내 예산 · 초과 n건 … 금액 [수정]
    ok: () => (
      <>
        {budget === null ? (
          <p className={styles.empty}>예산을 입력하면 넘는 매물을 표시합니다</p>
        ) : (
          <>
            <p className={styles.label}>내 예산</p>
            {overBudgetCount > 0 && (
              <p className={styles.overCount}>예산 초과 {overBudgetCount}건</p>
            )}
            <strong className={styles.amount}>
              <MaskedValue isMasked={isMasked}>{formatManwon(budget)}</MaskedValue>
            </strong>
          </>
        )}
        <button type="button" className={styles.editButton} onClick={() => setIsEditing(true)}>
          {budget === null ? "예산 입력" : "수정"}
        </button>
      </>
    ),
    loading: () => (
      <>
        <p className={styles.empty}>예산을 불러오는 중</p>
        <button type="button" className={styles.editButton} disabled>
          예산 입력
        </button>
      </>
    ),
    // 제목 아래 안내가 [다시 시도]를 보인다.
    accountError: () => <p className={styles.empty}>계정 상태를 확인한 뒤 다시 시도해 주세요</p>,
    loadFailed: () => (
      <>
        <p role="alert" className={styles.errorText}>
          예산을 불러오지 못했습니다
        </p>
        <button type="button" className={styles.editButton} disabled={isRetrying} onClick={onRetry}>
          다시 시도
        </button>
      </>
    ),
  };

  return (
    <section className={styles.bar} aria-label="내 예산" aria-busy={state.status === "loading"}>
      {rows[state.status]()}
    </section>
  );
}

export default BudgetBar;
