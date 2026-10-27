import {
  INTERIOR_PLAN_EXPORT_FILE_EXTENSION,
  INTERIOR_PLAN_EXPORT_FILE_LABEL,
  INTERIOR_PLAN_TABLE_HEADING,
  INTERIOR_PLAN_TABLE_SEPARATOR,
} from "@/lib/constants/interiorPlanTable";

import { formatWon } from "./amount";
import { tbdExclusionNote } from "./interiorPlanRows";

import type { InteriorPlanSummary } from "./interiorPlanRows";

export type InteriorPlanTableHeading = {
  /** `{플랜 이름} 인테리어 계획`. 표의 접근 가능한 이름이기도 하다 */
  title: string;
  /** `{today} 기준` */
  basis: string;
  /** `총 예산 10,000,000원`. 총 예산이 없으면 undefined */
  budget: string | undefined;
  /** `지출 예정 8,000,000원`(0이어도 있음). 확정 미정 줄이 있으면 뒤에 `(금액 미정 n건 제외)` — 조각 하나라 같이 가린다 */
  plannedTotal: string;
  /** `남은 예산 2,000,000원`, 음수면 `예산 초과 1,000,000원`. 총 예산이 없으면 undefined */
  remaining: string | undefined;
  /** 있는 조각을 " · "로 이은 한 줄 */
  line: string;
};

function remainingOf(remainingWon: number | null): string | undefined {
  if (remainingWon === null) return undefined;
  return remainingWon < 0
    ? INTERIOR_PLAN_TABLE_HEADING.overBudget(formatWon(-remainingWon))
    : INTERIOR_PLAN_TABLE_HEADING.remaining(formatWon(remainingWon));
}

/**
 * 표 머리(화면·인쇄 공통, U8): `{today} 기준 · 총 예산 · 지출 예정 · 남은 예산`(총 예산이 없으면 지출 예정만).
 * 가리기 때 화면이 금액 조각만 가릴 수 있게 조각으로도 준다. `today`는 파일 이름과 같은 렌더의 `now`에서 온다.
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
  const remaining = remainingOf(summary.remainingWon);
  const pieces = [basis, budget, plannedTotal, remaining].filter(
    (piece): piece is string => piece !== undefined,
  );
  return {
    title: INTERIOR_PLAN_TABLE_HEADING.title(planName),
    basis,
    budget,
    plannedTotal,
    remaining,
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
