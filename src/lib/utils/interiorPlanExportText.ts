import {
  INTERIOR_PLAN_EXPORT_FILE_EXTENSION,
  INTERIOR_PLAN_EXPORT_FILE_LABEL,
  INTERIOR_PLAN_TABLE_HEADING,
  INTERIOR_PLAN_TABLE_SEPARATOR,
} from "@/lib/constants/interiorPlanTable";

import { formatWon } from "./amount";
import { tbdExclusionNote } from "./interiorPlanRows";

import type { InteriorPlanSummary } from "./interiorPlanRows";

type InteriorPlanTableHeading = {
  /** `{플랜 이름} 인테리어 계획`. 표의 접근 가능한 이름이기도 하다 */
  title: string;
  /**
   * `{today} 기준 · 총 예산 · 지출 예정 · 지출 완료 · 남은 예산`(있는 조각만 " · "로 잇는다). 지출 예정은 0이어도 있고
   * 지출 완료는 [완료] 줄이 없으면 없다.
   * 확정 미정 줄이 있으면 뒤에 `(금액 미정 n건 제외)`. 남은 예산이 음수면 `예산 초과`
   */
  line: string;
};

function remainingOf(remainingWon: number | null): string | undefined {
  if (remainingWon === null) return undefined;
  return remainingWon < 0
    ? INTERIOR_PLAN_TABLE_HEADING.overBudget(formatWon(-remainingWon))
    : INTERIOR_PLAN_TABLE_HEADING.remaining(formatWon(remainingWon));
}

/**
 * 표 머리(화면·인쇄 공통, U8): `{today} 기준 · 총 예산 · 지출 예정 · (지출 완료) · 남은 예산`(총 예산이 없으면 지출 예정·완료만).
 * `today`는 파일 이름과 같은 렌더의 `now`에서 온다.
 */
export function interiorPlanTableHeading(
  planName: string,
  summary: InteriorPlanSummary,
  today: string,
): InteriorPlanTableHeading {
  const basis = INTERIOR_PLAN_TABLE_HEADING.basis(today);
  const budget =
    summary.budgetWon === null
      ? undefined
      : INTERIOR_PLAN_TABLE_HEADING.budget(formatWon(summary.budgetWon));
  const tbdNote = tbdExclusionNote(summary.tbdCount);
  const plannedTotal =
    INTERIOR_PLAN_TABLE_HEADING.plannedTotal(formatWon(summary.plannedTotalWon)) +
    (tbdNote === "" ? "" : `(${tbdNote})`);
  const doneTotal =
    summary.doneCount === 0
      ? undefined
      : INTERIOR_PLAN_TABLE_HEADING.doneTotal(formatWon(summary.doneTotalWon));
  const remaining = remainingOf(summary.remainingWon);
  const pieces = [basis, budget, plannedTotal, doneTotal, remaining].filter(
    (piece): piece is string => piece !== undefined,
  );
  return {
    title: INTERIOR_PLAN_TABLE_HEADING.title(planName),
    line: pieces.join(INTERIOR_PLAN_TABLE_SEPARATOR),
  };
}

/** Windows·macOS 파일 이름에 쓸 수 없는 문자 9개 */
const FORBIDDEN_FILE_NAME_CHARS = new Set(["\\", "/", ":", "*", "?", '"', "<", ">", "|"]);

/** 금지 문자이거나 제어 문자(U+0000–U+001F, U+007F) */
function isUnsafeFileNameChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return FORBIDDEN_FILE_NAME_CHARS.has(char) || code <= 0x1f || code === 0x7f;
}

/**
 * 내려받는 CSV 이름 `{이름}-인테리어-{today}.csv`(U20). 이름은 ① 금지·제어 문자를 하나씩 `_`로 바꾸고(합치지 않음)
 * ② 앞뒤 공백·마침표를 떼고 ③ 남는 것이 없으면 `인테리어-{today}.csv`로 한다. 길이는 자르지 않는다(이름 상한 40자).
 */
export function interiorPlanExportFileName(planName: string, today: string): string {
  const replaced = Array.from(planName, (char) => (isUnsafeFileNameChar(char) ? "_" : char)).join(
    "",
  );
  const name = replaced.replace(/^[ .]+|[ .]+$/g, "");
  const base = `${INTERIOR_PLAN_EXPORT_FILE_LABEL}-${today}${INTERIOR_PLAN_EXPORT_FILE_EXTENSION}`;
  return name === "" ? base : `${name}-${base}`;
}
