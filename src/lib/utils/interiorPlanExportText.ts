import {
  INTERIOR_PLAN_EXPORT_FILE_EXTENSION,
  INTERIOR_PLAN_EXPORT_FILE_LABEL,
  INTERIOR_PLAN_TABLE_HEADING,
  INTERIOR_PLAN_TABLE_SEPARATOR,
  WON_PER_MANWON,
} from "@/lib/constants/interiorPlanTable";

import { formatThousands } from "./amount";

import type { InteriorPlanSummary } from "./summarizeInteriorPlan";

export type InteriorPlanTableHeading = {
  /** `{플랜 이름} 인테리어 계획`. 표의 접근 가능한 이름이기도 하다 */
  title: string;
  /** `{today} 기준` */
  basis: string;
  /** `총 예산 15,000,000원`. 총 예산이 없으면 undefined */
  budget: string | undefined;
  /** `예상 총액 11,500,000원`(0이어도 있음) */
  expectedTotal: string;
  /** 있는 조각을 " · "로 이은 한 줄 */
  line: string;
};

/** 만원 → `15,000,000`(원, 천 단위 쉼표) */
function formatWon(manwon: number): string {
  return formatThousands(manwon * WON_PER_MANWON);
}

/**
 * 표 머리(화면·인쇄 공통). 가리기 때 화면이 총 예산·예상 총액 조각만 가릴 수 있게 조각으로도 준다.
 * `today`는 `toLocalDateString(now)`이고 파일 이름과 같은 `now`에서 온다(A14).
 */
export function interiorPlanTableHeading(
  planName: string,
  summary: Pick<InteriorPlanSummary, "budget" | "expectedTotal">,
  today: string,
): InteriorPlanTableHeading {
  const basis = INTERIOR_PLAN_TABLE_HEADING.basis(today);
  const budget =
    summary.budget === null
      ? undefined
      : INTERIOR_PLAN_TABLE_HEADING.budget(formatWon(summary.budget));
  const expectedTotal = INTERIOR_PLAN_TABLE_HEADING.expectedTotal(formatWon(summary.expectedTotal));
  const pieces = budget === undefined ? [basis, expectedTotal] : [basis, budget, expectedTotal];
  return {
    title: INTERIOR_PLAN_TABLE_HEADING.title(planName),
    basis,
    budget,
    expectedTotal,
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
