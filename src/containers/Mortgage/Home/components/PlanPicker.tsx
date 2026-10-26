import { INTERIOR_PLAN_MAX_COUNT } from "@/lib/constants/interiorPlan";
import { PATHS } from "@/lib/constants/paths";

import styles from "./PlanPicker.module.css";
import { PLAN_LIMIT_MESSAGE } from "../planWriteFailure";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

type PlanPickerProps = {
  plans: InteriorPlanWithItems[];
  onCreate: (button: HTMLButtonElement) => void;
};

/** 계획이 2~3개일 때 고르기. 고른 계획은 주소(`#/home/{planId}`)로 연다(뒤로 가기로 여기 돌아온다). */
function PlanPicker({ plans, onCreate }: PlanPickerProps) {
  const isFull = plans.length >= INTERIOR_PLAN_MAX_COUNT;

  return (
    <section className={styles.picker} aria-labelledby="plan-picker-title">
      <h2 id="plan-picker-title" className={styles.title}>
        계획 고르기
      </h2>
      <ul className={styles.list}>
        {plans.map((plan) => (
          <li key={plan.id}>
            <a className={styles.planLink} href={PATHS.home({ planId: plan.id })}>
              <span className={styles.planName}>{plan.name}</span>
              <span className={styles.planMeta}>항목 {plan.items.length}개</span>
            </a>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={styles.createButton}
        aria-haspopup="dialog"
        disabled={isFull}
        onClick={(event) => onCreate(event.currentTarget)}
      >
        계획 만들기
      </button>
      {isFull && <p className={styles.note}>{PLAN_LIMIT_MESSAGE}</p>}
    </section>
  );
}

export default PlanPicker;
