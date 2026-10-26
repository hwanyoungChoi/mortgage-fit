import { useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";

import AmountInput from "@/components/AmountInput";
import ChoiceGroup from "@/components/ChoiceGroup";
import Sheet from "@/components/Sheet";
import {
  INTERIOR_ITEM_MEMO_MAX_LENGTH,
  INTERIOR_ITEM_STATUSES,
  INTERIOR_ITEM_STATUS_LABELS,
  INTERIOR_PAYMENT_LABEL_PRESETS,
  INTERIOR_PAYMENT_MAX_COUNT,
  INTERIOR_QUOTE_MAX_COUNT,
  INTERIOR_TRADE_MAX_LENGTH,
  INTERIOR_TRADES,
} from "@/lib/constants/interiorPlan";
import { formatManwon, formatThousands } from "@/lib/utils/amount";
import { createRandomId } from "@/lib/utils/createRandomId";
import {
  cancelQuoteConfirm,
  confirmQuote,
  createInteriorItemDraft,
  createPaymentDraft,
  createQuoteDraft,
  interiorItemDraftErrors,
  isSameItemDraft,
  paymentField,
  quoteField,
  removeQuote,
  summarizePaymentDraft,
  toInteriorItemDraft,
  validateInteriorItemDraft,
} from "@/lib/utils/interiorItemDraft";
import { countChars } from "@/lib/utils/validateListingName";

import styles from "./ItemSheet.module.css";
import PaymentRow from "./PaymentRow";
import QuoteRow from "./QuoteRow";
import formStyles from "./SheetForm.module.css";
import { ITEM_LIMIT_MESSAGE, planWriteFailureMessage } from "../planWriteFailure";

import type {
  InteriorItemDraft,
  InteriorItemDraftField,
  InteriorPaymentDraft,
  InteriorQuoteDraft,
} from "@/lib/types/interiorItemDraft";
import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlanWithItems,
} from "@/lib/types/interiorPlan";
import type { InteriorPlanWriteResult } from "@/lib/types/interiorPlanStore";

type ItemSheetProps = {
  plan: InteriorPlanWithItems;
  /** 고칠 항목. null이면 새 항목이다 */
  item: InteriorItem | null;
  /** 새 항목의 공간(공간 묶음의 [추가]면 그 공간, 아니면 첫 공간) */
  initialSpaceId: string;
  /** 성공하면 부르는 쪽이 닫는다. 실패하면 입력을 그대로 두고 이유를 보인다 */
  onSave: (input: InteriorItemInput) => Promise<InteriorPlanWriteResult>;
  /** 시트가 확인한 뒤 부른다. 성공하면 부르는 쪽이 닫는다 */
  onDelete: (itemId: string) => Promise<InteriorPlanWriteResult>;
  onClose: () => void;
};

const DISCARD_CONFIRM_MESSAGE = "고친 내용을 버리고 닫을까요?";
const CUSTOM_PAYMENT_LABEL = "";

/** 칸 id. 첫 오류로 포커스를 옮길 때 오류의 칸 이름에서 찾는다 */
const fieldInputId = (field: InteriorItemDraftField) =>
  `interior-item-${field.replaceAll(":", "-")}`;

const STATUS_OPTIONS = INTERIOR_ITEM_STATUSES.map((value) => ({
  value,
  label: INTERIOR_ITEM_STATUS_LABELS[value],
}));

/** "지급 합계 1,200만원 / 확정 1,250만원 — 50만원 남음". 확정 견적이 없으면 합계만 */
function describePaymentTotals(draft: InteriorItemDraft): string | null {
  if (draft.payments.length === 0) return null;
  const { paymentTotal, confirmedAmount } = summarizePaymentDraft(draft);
  const total = paymentTotal === null ? "—" : formatManwon(paymentTotal);
  if (confirmedAmount === null || paymentTotal === null) return `지급 합계 ${total}`;
  const difference = confirmedAmount - paymentTotal;
  const rest =
    difference >= 0 ? `${formatManwon(difference)} 남음` : `${formatManwon(-difference)} 초과`;
  return `지급 합계 ${total} / 확정 ${formatManwon(confirmedAmount)} — ${rest}`;
}

/**
 * 항목 시트: 공간 · 공종(프리셋 칩 + 직접 입력) · 예산 · 견적(확정 라디오) · 지급 · 상태 · 시작·끝 · 메모.
 * 입력은 연 시점의 값에서 시작하고 저장 전에는 다른 곳의 변경으로 덮이지 않는다. 오류는 칸을 벗어난 뒤 그 칸 아래에,
 * 저장을 누르면 모두 보이고 첫 오류 칸으로 간다. 고친 것이 없으면 [저장]이 막히고, 고친 채 닫으면 확인한다.
 */
function ItemSheet({ plan, item, initialSpaceId, onSave, onDelete, onClose }: ItemSheetProps) {
  const [initialDraft] = useState(() =>
    item === null ? createInteriorItemDraft(initialSpaceId) : toInteriorItemDraft(item),
  );
  const [draft, setDraft] = useState(initialDraft);
  const [blurredFields, setBlurredFields] = useState<Set<InteriorItemDraftField>>(() => new Set());
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const addQuoteButtonRef = useRef<HTMLButtonElement>(null);
  const customPaymentButtonRef = useRef<HTMLButtonElement>(null);

  const spaceIds = plan.spaces.map((space) => space.id);
  const errors = interiorItemDraftErrors(draft, spaceIds);
  const isChanged = !isSameItemDraft(draft, initialDraft);
  const isSpaceKnown = spaceIds.includes(draft.spaceId);
  const canAddQuote = draft.quotes.length < INTERIOR_QUOTE_MAX_COUNT;
  const canAddPayment = draft.payments.length < INTERIOR_PAYMENT_MAX_COUNT;
  const paymentTotals = describePaymentTotals(draft);

  const errorOf = (field: InteriorItemDraftField): string | null => {
    if (!isSubmitted && !blurredFields.has(field)) return null;
    return errors.find((error) => error.field === field)?.message ?? null;
  };

  const markBlurred = (field: InteriorItemDraftField) => {
    setBlurredFields((prev) => new Set(prev).add(field));
  };

  const update = (patch: Partial<InteriorItemDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const updateQuote = (quoteId: string, patch: Partial<InteriorQuoteDraft>) => {
    setDraft((prev) => ({
      ...prev,
      quotes: prev.quotes.map((quote) => (quote.id === quoteId ? { ...quote, ...patch } : quote)),
    }));
  };

  const updatePayment = (paymentId: string, patch: Partial<InteriorPaymentDraft>) => {
    setDraft((prev) => ({
      ...prev,
      payments: prev.payments.map((payment) =>
        payment.id === paymentId ? { ...payment, ...patch } : payment,
      ),
    }));
  };

  /** 칸이 그려진 뒤 포커스를 옮긴다 */
  const focusField = (field: InteriorItemDraftField) => {
    document.getElementById(fieldInputId(field))?.focus();
  };

  const handleAddQuote = () => {
    const quote = createQuoteDraft(createRandomId());
    flushSync(() => setDraft((prev) => ({ ...prev, quotes: [...prev.quotes, quote] })));
    focusField(quoteField(quote.id, "vendor"));
  };

  const handleRemoveQuote = (quoteId: string) => {
    flushSync(() => setDraft((prev) => removeQuote(prev, quoteId)));
    addQuoteButtonRef.current?.focus();
  };

  /** 칩(계약금·중도금·잔금)이면 금액 칸으로, [직접 입력]이면 이름 칸으로 간다 */
  const handleAddPayment = (label: string) => {
    const payment = createPaymentDraft(createRandomId(), label);
    flushSync(() => setDraft((prev) => ({ ...prev, payments: [...prev.payments, payment] })));
    focusField(paymentField(payment.id, label === CUSTOM_PAYMENT_LABEL ? "label" : "amount"));
  };

  const handleRemovePayment = (paymentId: string) => {
    flushSync(() =>
      setDraft((prev) => ({
        ...prev,
        payments: prev.payments.filter((payment) => payment.id !== paymentId),
      })),
    );
    customPaymentButtonRef.current?.focus();
  };

  const handleClose = () => {
    if (!isChanged || window.confirm(DISCARD_CONFIRM_MESSAGE)) onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSubmitted(true);
    const validation = validateInteriorItemDraft(draft, spaceIds);
    if (!validation.ok) {
      focusField(validation.errors[0].field);
      return;
    }
    setIsSaving(true);
    const result = await onSave(validation.input);
    setIsSaving(false);
    setWriteError(result.ok ? null : planWriteFailureMessage(result.reason, ITEM_LIMIT_MESSAGE));
  };

  const handleDelete = async (target: InteriorItem) => {
    if (!window.confirm(`'${target.trade}' 항목을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    const result = await onDelete(target.id);
    if (!result.ok) setWriteError(planWriteFailureMessage(result.reason));
  };

  const renderTextError = (field: InteriorItemDraftField) => {
    const error = errorOf(field);
    return error === null ? null : (
      <p id={`${fieldInputId(field)}-error`} className={formStyles.error}>
        {error}
      </p>
    );
  };

  const describedBy = (field: InteriorItemDraftField, extraId?: string) => {
    const ids = [
      ...(extraId === undefined ? [] : [extraId]),
      ...(errorOf(field) === null ? [] : [`${fieldInputId(field)}-error`]),
    ];
    return ids.length === 0 ? undefined : ids.join(" ");
  };

  const tradeCountId = `${fieldInputId("trade")}-count`;
  const memoCountId = `${fieldInputId("memo")}-count`;

  return (
    <Sheet title={item === null ? "항목 추가" : "항목"} onClose={handleClose}>
      <form className={formStyles.form} noValidate onSubmit={handleSubmit}>
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor={fieldInputId("spaceId")}>
            공간
          </label>
          <select
            id={fieldInputId("spaceId")}
            className={formStyles.select}
            value={isSpaceKnown ? draft.spaceId : ""}
            aria-invalid={errorOf("spaceId") !== null}
            aria-describedby={describedBy("spaceId")}
            onChange={(event) => update({ spaceId: event.target.value })}
            onBlur={() => markBlurred("spaceId")}
          >
            {!isSpaceKnown && (
              <option value="" disabled>
                공간을 고르세요
              </option>
            )}
            {plan.spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
          {renderTextError("spaceId")}
        </div>

        <div className={formStyles.field}>
          <div className={formStyles.labelRow}>
            <label className={formStyles.label} htmlFor={fieldInputId("trade")}>
              공종
            </label>
            <span id={tradeCountId} className={formStyles.count}>
              {countChars(draft.trade.trim())}/{INTERIOR_TRADE_MAX_LENGTH}
            </span>
          </div>
          <div className={formStyles.chips} role="group" aria-label="공종 고르기">
            {INTERIOR_TRADES.map((trade) => (
              <button
                key={trade}
                type="button"
                className={formStyles.chip}
                aria-pressed={draft.trade.trim() === trade}
                onClick={() => update({ trade })}
              >
                {trade}
              </button>
            ))}
          </div>
          <input
            id={fieldInputId("trade")}
            className={formStyles.input}
            type="text"
            autoComplete="off"
            enterKeyHint="next"
            placeholder="직접 입력"
            value={draft.trade}
            aria-invalid={errorOf("trade") !== null}
            aria-describedby={describedBy("trade", tradeCountId)}
            onChange={(event) => update({ trade: event.target.value })}
            onBlur={() => markBlurred("trade")}
          />
          {renderTextError("trade")}
        </div>

        <AmountInput
          id={fieldInputId("budget")}
          label="예산(선택)"
          value={draft.budget}
          error={errorOf("budget")}
          onChange={(budget) => update({ budget })}
          onBlur={() => markBlurred("budget")}
        />

        <section className={formStyles.section} aria-labelledby="interior-item-quotes-title">
          <div className={formStyles.labelRow}>
            <h3 id="interior-item-quotes-title" className={formStyles.sectionTitle}>
              견적
            </h3>
            <span className={formStyles.count}>
              {draft.quotes.length}/{INTERIOR_QUOTE_MAX_COUNT}
            </span>
          </div>
          {draft.quotes.length > 0 && (
            <ul className={styles.lines}>
              {draft.quotes.map((quote, index) => (
                <QuoteRow
                  key={quote.id}
                  quote={quote}
                  number={index + 1}
                  isConfirmed={draft.confirmedQuoteId === quote.id}
                  inputIdOf={(name) => fieldInputId(quoteField(quote.id, name))}
                  errorOf={(name) => errorOf(quoteField(quote.id, name))}
                  onChange={(patch) => updateQuote(quote.id, patch)}
                  onBlur={(name) => markBlurred(quoteField(quote.id, name))}
                  onConfirm={() => setDraft((prev) => confirmQuote(prev, quote.id))}
                  onDelete={() => handleRemoveQuote(quote.id)}
                />
              ))}
            </ul>
          )}
          <div className={styles.sectionActions}>
            <button
              ref={addQuoteButtonRef}
              type="button"
              className={formStyles.addButton}
              disabled={!canAddQuote}
              onClick={handleAddQuote}
            >
              견적 추가
            </button>
            {draft.confirmedQuoteId !== null && (
              <button
                type="button"
                className={formStyles.secondaryButton}
                onClick={() => setDraft((prev) => cancelQuoteConfirm(prev))}
              >
                확정 취소
              </button>
            )}
          </div>
          {!canAddQuote && (
            <p className={formStyles.limitNote}>
              견적은 {INTERIOR_QUOTE_MAX_COUNT}개까지 적을 수 있습니다
            </p>
          )}
        </section>

        <section className={formStyles.section} aria-labelledby="interior-item-payments-title">
          <div className={formStyles.labelRow}>
            <h3 id="interior-item-payments-title" className={formStyles.sectionTitle}>
              지급
            </h3>
            <span className={formStyles.count}>
              {draft.payments.length}/{INTERIOR_PAYMENT_MAX_COUNT}
            </span>
          </div>
          {draft.payments.length > 0 && (
            <ul className={styles.lines}>
              {draft.payments.map((payment, index) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  number={index + 1}
                  inputIdOf={(name) => fieldInputId(paymentField(payment.id, name))}
                  errorOf={(name) => errorOf(paymentField(payment.id, name))}
                  onChange={(patch) => updatePayment(payment.id, patch)}
                  onBlur={(name) => markBlurred(paymentField(payment.id, name))}
                  onDelete={() => handleRemovePayment(payment.id)}
                />
              ))}
            </ul>
          )}
          {paymentTotals !== null && <p className={styles.paymentTotals}>{paymentTotals}</p>}
          <div className={formStyles.chips} role="group" aria-label="지급 줄 추가">
            {INTERIOR_PAYMENT_LABEL_PRESETS.map((label) => (
              <button
                key={label}
                type="button"
                className={formStyles.chip}
                disabled={!canAddPayment}
                onClick={() => handleAddPayment(label)}
              >
                {label}
              </button>
            ))}
            <button
              ref={customPaymentButtonRef}
              type="button"
              className={formStyles.chip}
              disabled={!canAddPayment}
              onClick={() => handleAddPayment(CUSTOM_PAYMENT_LABEL)}
            >
              직접 입력
            </button>
          </div>
          {!canAddPayment && (
            <p className={formStyles.limitNote}>
              지급 줄은 {INTERIOR_PAYMENT_MAX_COUNT}개까지 적을 수 있습니다
            </p>
          )}
        </section>

        <div className={formStyles.section}>
          <ChoiceGroup
            name="interiorItemStatus"
            legend="상태"
            options={STATUS_OPTIONS}
            value={draft.status}
            columns={3}
            onChange={(status) => update({ status })}
          />
        </div>

        <div className={formStyles.twoColumns}>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor={fieldInputId("startDate")}>
              시작
            </label>
            <input
              id={fieldInputId("startDate")}
              className={formStyles.input}
              type="date"
              value={draft.startDate}
              aria-invalid={errorOf("startDate") !== null}
              aria-describedby={describedBy("startDate")}
              onChange={(event) => update({ startDate: event.target.value })}
              onBlur={() => markBlurred("startDate")}
            />
            {renderTextError("startDate")}
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor={fieldInputId("endDate")}>
              끝
            </label>
            <input
              id={fieldInputId("endDate")}
              className={formStyles.input}
              type="date"
              value={draft.endDate}
              aria-invalid={errorOf("endDate") !== null}
              aria-describedby={describedBy("endDate")}
              onChange={(event) => update({ endDate: event.target.value })}
              onBlur={() => markBlurred("endDate")}
            />
            {renderTextError("endDate")}
          </div>
        </div>

        <div className={formStyles.field}>
          <div className={formStyles.labelRow}>
            <label className={formStyles.label} htmlFor={fieldInputId("memo")}>
              메모(선택)
            </label>
            <span id={memoCountId} className={formStyles.count}>
              {formatThousands(countChars(draft.memo.trim()))}/
              {formatThousands(INTERIOR_ITEM_MEMO_MAX_LENGTH)}
            </span>
          </div>
          <textarea
            id={fieldInputId("memo")}
            className={formStyles.textarea}
            rows={3}
            value={draft.memo}
            aria-invalid={errorOf("memo") !== null}
            aria-describedby={describedBy("memo", memoCountId)}
            onChange={(event) => update({ memo: event.target.value })}
            onBlur={() => markBlurred("memo")}
          />
          {renderTextError("memo")}
        </div>

        {writeError !== null && (
          <p role="alert" className={formStyles.error}>
            {writeError}
          </p>
        )}
        <div className={formStyles.actions}>
          {item !== null && (
            <button
              type="button"
              className={formStyles.dangerButton}
              onClick={() => void handleDelete(item)}
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
