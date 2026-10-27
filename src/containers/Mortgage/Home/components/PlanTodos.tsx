import { useState } from "react";

import MaskedValue from "@/components/MaskedValue";
import { INTERIOR_NO_SPACE_LABEL } from "@/lib/constants/interiorSpaces";
import { formatManwon } from "@/lib/utils/amount";
import { formatMonthDay } from "@/lib/utils/formatMonthDay";

import styles from "./PlanTodos.module.css";

import type {
  InteriorItemLine,
  InteriorPaymentTodo,
  InteriorPlanSummary,
} from "@/lib/utils/summarizeInteriorPlan";
import type { ReactNode } from "react";

type PlanTodosProps = {
  summary: InteriorPlanSummary;
  isMasked: boolean;
  /** 할 일 줄을 누르면 그 항목 시트를 연다 */
  onItemOpen: (itemId: string, button: HTMLButtonElement) => void;
};

/** 묶음마다 처음 보이는 줄 수. 나머지는 [더 보기]로 편다(목록이 화면 밖으로 밀리지 않게). */
const VISIBLE_TODO_COUNT = 3;

const itemName = (line: InteriorItemLine) =>
  `${line.spaceName ?? INTERIOR_NO_SPACE_LABEL} · ${line.item.trade}`;

type TodoGroupProps<T> = {
  title: string;
  entries: T[];
  keyOf: (entry: T) => string;
  renderEntry: (entry: T) => ReactNode;
};

/** 할 일 묶음 하나: 제목·개수, 처음 3줄, [더 보기 n개] */
function TodoGroup<T>({ title, entries, keyOf, renderEntry }: TodoGroupProps<T>) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (entries.length === 0) return null;
  const visibleEntries = isExpanded ? entries : entries.slice(0, VISIBLE_TODO_COUNT);
  const hiddenCount = entries.length - visibleEntries.length;

  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>
        {title} {entries.length}
      </h3>
      <ul className={styles.entries}>
        {visibleEntries.map((entry) => (
          <li key={keyOf(entry)}>{renderEntry(entry)}</li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button type="button" className={styles.moreButton} onClick={() => setIsExpanded(true)}>
          {hiddenCount}개 더 보기
        </button>
      )}
    </div>
  );
}

/**
 * 할 일(AC-4): 지급 예정(지급함이 아닌 지급 줄, 날짜순, 오늘보다 앞이면 "지남") · 견적 받기(견적 0개·미확정) · 확정하기(견적 1개 이상·미확정).
 * 할 일이 하나도 없으면 그리지 않는다.
 */
function PlanTodos({ summary, isMasked, onItemOpen }: PlanTodosProps) {
  const { paymentTodos, quoteTodos, confirmTodos } = summary;
  if (paymentTodos.length + quoteTodos.length + confirmTodos.length === 0) return null;

  const renderPayment = ({ line, payment, isOverdue }: InteriorPaymentTodo) => (
    <button
      type="button"
      className={styles.entry}
      aria-haspopup="dialog"
      onClick={(event) => onItemOpen(line.item.id, event.currentTarget)}
    >
      <span className={styles.entryName}>
        {itemName(line)} {payment.label}
      </span>
      <span className={styles.entryMeta}>
        <MaskedValue isMasked={isMasked}>{formatManwon(payment.amount)}</MaskedValue>
        {payment.dueDate !== undefined && <span> · {formatMonthDay(payment.dueDate)}</span>}
        {isOverdue && <span className={styles.overdue}>지남</span>}
      </span>
    </button>
  );

  const renderItem = (line: InteriorItemLine) => {
    const quoteCount = line.item.quotes?.length ?? 0;
    return (
      <button
        type="button"
        className={styles.entry}
        aria-haspopup="dialog"
        onClick={(event) => onItemOpen(line.item.id, event.currentTarget)}
      >
        <span className={styles.entryName}>{itemName(line)}</span>
        {quoteCount > 0 && <span className={styles.entryMeta}>견적 {quoteCount}개</span>}
      </button>
    );
  };

  return (
    <section className={styles.todos} aria-labelledby="plan-todos-title">
      <h2 id="plan-todos-title" className={styles.title}>
        할 일
      </h2>
      <TodoGroup
        title="지급 예정"
        entries={paymentTodos}
        keyOf={(todo) => `${todo.line.item.id}:${todo.payment.id}`}
        renderEntry={renderPayment}
      />
      <TodoGroup
        title="견적 받기"
        entries={quoteTodos}
        keyOf={(line) => line.item.id}
        renderEntry={renderItem}
      />
      <TodoGroup
        title="확정하기"
        entries={confirmTodos}
        keyOf={(line) => line.item.id}
        renderEntry={renderItem}
      />
    </section>
  );
}

export default PlanTodos;
