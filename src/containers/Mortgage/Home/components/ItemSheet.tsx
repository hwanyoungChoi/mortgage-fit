import { useId, useState, type FormEvent } from "react";

import AmountInput from "@/components/AmountInput";
import Sheet from "@/components/Sheet";
import {
  INTERIOR_ITEM_MEMO_MAX_LENGTH,
  INTERIOR_QUOTE_MEMO_MAX_LENGTH,
  INTERIOR_TRADE_MAX_LENGTH,
  INTERIOR_VENDOR_MAX_LENGTH,
} from "@/lib/constants/interiorPlan";
import { formatThousands } from "@/lib/utils/amount";
import {
  createInteriorLineDraft,
  interiorLineDraftErrors,
  isSameLineDraft,
  toInteriorLineDraft,
  validateInteriorLineDraft,
} from "@/lib/utils/interiorLineDraft";
import { removeLineWrite } from "@/lib/utils/interiorLineWrites";
import { countChars } from "@/lib/utils/validateListingName";

import formStyles from "./SheetForm.module.css";
import { ITEM_LIMIT_MESSAGE, planWriteFailureMessage } from "../planWriteFailure";

import type {
  InteriorLineDraft,
  InteriorLineDraftField,
  InteriorLineValues,
} from "@/lib/types/interiorLineDraft";
import type { InteriorItem } from "@/lib/types/interiorPlan";
import type { InteriorPlanSourceWriteResult } from "@/lib/types/interiorPlanStore";
import type { InteriorLineRemoval } from "@/lib/utils/interiorLineWrites";
import type { InteriorPlanRow } from "@/lib/utils/interiorPlanRows";

type ItemSheetProps = {
  /** 이 계획의 기존 구분(입력 제안). 철자 차이로 묶음이 갈라지는 것을 줄인다 */
  tradeSuggestions: string[];
  /** 고칠 줄. null이면 새 줄이다 */
  row: InteriorPlanRow | null;
  /** 새 줄의 구분. 묶음 끝 [+ {구분}에 줄 추가]면 그 구분이고 포커스는 세부내용 칸(구분 다음 칸)에서 시작한다 */
  initialTrade: string;
  /**
   * 성공하면 부르는 쪽이 닫는다. 실패하면 입력을 그대로 두고 이유를 보인다.
   * `openedRow`는 시트를 연 시점의 줄(새 줄이면 null)이다. 그 항목 전체로 숨은 값을 보존하고 `updatedAt`으로 동시 편집을 확인한다
   */
  onSave: (
    values: InteriorLineValues,
    openedRow: InteriorPlanRow | null,
  ) => Promise<InteriorPlanSourceWriteResult>;
  /** 시트가 확인한 뒤 부른다. 성공하면 부르는 쪽이 닫는다 */
  onDelete: (
    removal: InteriorLineRemoval,
    openedItem: InteriorItem,
  ) => Promise<InteriorPlanSourceWriteResult>;
  /** 다른 사람이 같은 항목을 저장했을 때 [최신 값 불러오기]. 부르는 쪽이 시트를 지금 값으로 다시 연다 */
  onReload: () => void;
  onClose: () => void;
};

const DISCARD_CONFIRM_MESSAGE = "고친 내용을 버리고 닫을까요?";
const DELETE_CONFIRM_MESSAGE = "이 줄을 지울까요?";

/** 칸 id. 첫 오류로 포커스를 옮길 때 오류의 칸 이름에서 찾는다 */
const fieldInputId = (field: InteriorLineDraftField) => `interior-line-${field}`;

/** 줄을 지우면 항목째 지워질 때(견적 0~1개) 숨은 지급도 함께 지워진다고 알린다(A6) */
function deleteConfirmMessage(removal: InteriorLineRemoval): string {
  if (removal.kind === "removeItem" && removal.paymentCount > 0) {
    return `${DELETE_CONFIRM_MESSAGE} 지급 ${removal.paymentCount}건도 함께 지워집니다`;
  }
  return DELETE_CONFIRM_MESSAGE;
}

type TextFieldName = Exclude<InteriorLineDraftField, "amount" | "startDate" | "endDate">;

type TextFieldProps = {
  field: TextFieldName;
  label: string;
  value: string;
  maxLength: number;
  error: string | null;
  isMultiline?: boolean;
  listId?: string;
  isAutoFocused?: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
};

/** 글자 칸 하나: 라벨 · 현재/최대 글자 수 · 입력 · 그 칸 아래 오류 */
function TextField({
  field,
  label,
  value,
  maxLength,
  error,
  isMultiline = false,
  listId,
  isAutoFocused = false,
  onChange,
  onBlur,
}: TextFieldProps) {
  const id = fieldInputId(field);
  const countId = `${id}-count`;
  const errorId = `${id}-error`;
  const shared = {
    id,
    value,
    "aria-invalid": error !== null,
    "aria-describedby": error === null ? countId : `${countId} ${errorId}`,
    onBlur,
  };
  return (
    <div className={formStyles.field}>
      <div className={formStyles.labelRow}>
        <label className={formStyles.label} htmlFor={id}>
          {label}
        </label>
        <span id={countId} className={formStyles.count}>
          {formatThousands(countChars(value.trim()))}/{formatThousands(maxLength)}
        </span>
      </div>
      {isMultiline ? (
        <textarea
          {...shared}
          className={formStyles.textarea}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...shared}
          className={formStyles.input}
          type="text"
          autoComplete="off"
          enterKeyHint="next"
          list={listId}
          autoFocus={isAutoFocused}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error !== null && (
        <p id={errorId} className={formStyles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

type DateFieldProps = {
  field: "startDate" | "endDate";
  label: string;
  value: string;
  /** 고를 수 있는 가장 이른 날(끝나는 날 칸은 시작일) */
  min?: string;
  error: string | null;
  onChange: (value: string) => void;
  onBlur: () => void;
};

/** 날짜 칸 하나: 라벨 · 기기 날짜 고르기(`type="date"`, 값은 YYYY-MM-DD, 비우면 "") · 그 칸 아래 오류 */
function DateField({ field, label, value, min, error, onChange, onBlur }: DateFieldProps) {
  const id = fieldInputId(field);
  const errorId = `${id}-error`;
  return (
    <div className={formStyles.field}>
      <label className={formStyles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={formStyles.dateInput}
        type="date"
        value={value}
        min={min === "" ? undefined : min}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : errorId}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {error !== null && (
        <p id={errorId} className={formStyles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * 줄 시트: 구분(기존 구분 제안) · 세부내용 · 업체 · 견적 · 일정(시작일·끝나는 날) · 비고 · [확정] · [저장] · (기존 줄) [삭제].
 * 칸 순서는 목록 줄(세부내용 위, 업체 아래)과 같다. 표·CSV 열 순서(구분·업체·세부내용)와는 따로다.
 * 입력은 연 시점의 값에서 시작하고 저장 전에는 다른 곳의 변경(폴링 포함)으로 덮이지 않는다. 그 사이 다른 사람이 같은 항목을
 * 저장했으면 저장하지 않고 알린 뒤 [최신 값 불러오기]를 보인다. 오류는 칸을 벗어난 뒤 그 칸 아래에,
 * 저장을 누르면 모두 보이고 첫 오류 칸으로 간다. 고친 것이 없으면 [저장]이 막히고, 고친 채 닫으면 확인한다.
 * 일정은 항목 칸이라 견적 n≥2 옛 항목의 형제 줄과 같이 쓴다. 끝나는 날은 비워도 되고(하루 일정), 있으면 시작일과 같거나 뒤다.
 * 견적 n≥2 옛 항목의 줄은 구분·일정·비고·확정을 형제 줄과 같이 쓴다는 안내를 붙인다(D2 a).
 */
function ItemSheet({
  tradeSuggestions,
  row,
  initialTrade,
  onSave,
  onDelete,
  onReload,
  onClose,
}: ItemSheetProps) {
  const tradeListId = useId();
  const [openedRow] = useState(row);
  const [initialDraft] = useState(() =>
    row === null ? createInteriorLineDraft(initialTrade) : toInteriorLineDraft(row),
  );
  const [draft, setDraft] = useState(initialDraft);
  const [blurredFields, setBlurredFields] = useState<Set<InteriorLineDraftField>>(() => new Set());
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const errors = interiorLineDraftErrors(draft);
  const isChanged = !isSameLineDraft(draft, initialDraft);
  const sharedQuoteCount = (openedRow?.item.quotes ?? []).length;
  const isTradePrefilled = openedRow === null && initialTrade !== "";

  const errorOf = (field: InteriorLineDraftField): string | null => {
    if (!isSubmitted && !blurredFields.has(field)) return null;
    return errors.find((error) => error.field === field)?.message ?? null;
  };

  const markBlurred = (field: InteriorLineDraftField) => {
    setBlurredFields((prev) => new Set(prev).add(field));
  };

  const update = (patch: Partial<InteriorLineDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const handleClose = () => {
    if (!isChanged || window.confirm(DISCARD_CONFIRM_MESSAGE)) onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSubmitted(true);
    const validation = validateInteriorLineDraft(draft);
    if (!validation.ok) {
      document.getElementById(fieldInputId(validation.errors[0].field))?.focus();
      return;
    }
    setIsSaving(true);
    const result = await onSave(validation.values, openedRow);
    setIsSaving(false);
    setWriteError(result.ok ? null : planWriteFailureMessage(result.reason, ITEM_LIMIT_MESSAGE));
    setIsConflict(!result.ok && result.reason === "conflict");
  };

  const handleDelete = async (target: InteriorPlanRow) => {
    const removal = removeLineWrite(target.item, target.quote?.id ?? null);
    if (!window.confirm(deleteConfirmMessage(removal))) return;
    const result = await onDelete(removal, target.item);
    if (!result.ok) {
      setWriteError(planWriteFailureMessage(result.reason));
      setIsConflict(result.reason === "conflict");
    }
  };

  const fieldProps = <Field extends Exclude<InteriorLineDraftField, "amount">>(field: Field) => ({
    field,
    value: draft[field],
    error: errorOf(field),
    onChange: (value: string) => update({ [field]: value }),
    onBlur: () => markBlurred(field),
  });

  return (
    <Sheet title={openedRow === null ? "줄 추가" : "줄"} onClose={handleClose}>
      <form className={formStyles.form} noValidate onSubmit={handleSubmit}>
        <TextField
          {...fieldProps("trade")}
          label="구분"
          maxLength={INTERIOR_TRADE_MAX_LENGTH}
          listId={tradeListId}
        />
        <datalist id={tradeListId}>
          {tradeSuggestions.map((trade) => (
            <option key={trade} value={trade} />
          ))}
        </datalist>
        <TextField
          {...fieldProps("detail")}
          label="세부내용(선택)"
          maxLength={INTERIOR_QUOTE_MEMO_MAX_LENGTH}
          isAutoFocused={isTradePrefilled}
        />
        <TextField
          {...fieldProps("vendor")}
          label="업체(비우면 미정)"
          maxLength={INTERIOR_VENDOR_MAX_LENGTH}
        />
        <AmountInput
          id={fieldInputId("amount")}
          label="견적(비우면 미정)"
          unit="won"
          value={draft.amount}
          error={errorOf("amount")}
          onChange={(amount) => update({ amount })}
          onBlur={() => markBlurred("amount")}
        />
        <div className={formStyles.dateRow}>
          <DateField {...fieldProps("startDate")} label="시작일(선택)" />
          <DateField {...fieldProps("endDate")} label="끝나는 날(선택)" min={draft.startDate} />
        </div>
        <TextField
          {...fieldProps("note")}
          label="비고(선택)"
          maxLength={INTERIOR_ITEM_MEMO_MAX_LENGTH}
          isMultiline
        />
        <label className={formStyles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.isConfirmed}
            onChange={(event) => update({ isConfirmed: event.currentTarget.checked })}
          />
          확정
        </label>

        {sharedQuoteCount >= 2 && (
          <p className={formStyles.note}>
            같은 항목의 견적 {sharedQuoteCount}개가 구분·일정·비고·확정을 같이 씁니다
          </p>
        )}
        {writeError !== null && (
          <p role="alert" className={formStyles.error}>
            {writeError}
          </p>
        )}
        {isConflict && (
          <button type="button" className={formStyles.secondaryButton} onClick={onReload}>
            최신 값 불러오기
          </button>
        )}
        <div className={formStyles.actions}>
          {openedRow !== null && (
            <button
              type="button"
              className={formStyles.dangerButton}
              onClick={() => void handleDelete(openedRow)}
            >
              삭제
            </button>
          )}
          <button type="button" className={formStyles.secondaryButton} onClick={handleClose}>
            취소
          </button>
          <button
            type="submit"
            className={formStyles.primaryButton}
            disabled={!isChanged || isSaving}
          >
            저장
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export default ItemSheet;
