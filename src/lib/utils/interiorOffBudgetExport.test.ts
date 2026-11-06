// 스펙 interior-budget-exclude AC-6(표·CSV·인쇄, 예시 E·G)와 AC-3 F 계 비고(ADR-038 U7): 줄의 확정·완료 칸은 금액 그대로,
// 비고에 "예산 외", "계"는 예산 반영분만이고 계 비고가 "금액 미정 n건 제외 · 예산 외 n원 제외" 순서로 그 차이를 알린다.
import { describe, expect, it } from "vitest";

import {
  makeOffBudgetPlanE,
  makeOffBudgetPlanF,
  makeOffBudgetPlanG,
} from "@/test/interiorSimpleFixture";

import { buildInteriorPlanTable } from "./buildInteriorPlanTable";
import { interiorPlanTableHeading } from "./interiorPlanExportText";
import { buildInteriorPlanRows, summarizeInteriorPlan } from "./interiorPlanRows";
import { interiorPlanTableToCsvRows } from "./interiorPlanTableToCsvRows";
import { toCsv } from "./toCsv";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const TODAY = "2026-11-06";

const tableOf = (plan: InteriorPlanWithItems) =>
  buildInteriorPlanTable(buildInteriorPlanRows(plan));

/** CSV 본문 줄(BOM·CRLF 뺀 모양) */
const csvLinesOf = (plan: InteriorPlanWithItems) =>
  toCsv(interiorPlanTableToCsvRows(tableOf(plan)))
    .slice(1)
    .split("\r\n")
    .slice(0, -1);

const headingLineOf = (plan: InteriorPlanWithItems) =>
  interiorPlanTableHeading(plan.name, summarizeInteriorPlan(plan), TODAY).line;

describe("AC-6 예시 E: R3 [완료], R5 예산 외 + [완료]", () => {
  it("CSV 본문이 정확히 7행이다", () => {
    expect(csvLinesOf(makeOffBudgetPlanE())).toStrictEqual([
      "구분,업체,세부내용,견적(원),확정(원),완료(원),비고",
      "도배,육문수,실크 전체,1800000,1800000,,",
      "도배,동네도배,합지,1500000,,,",
      "욕실,하루바스,철거·방수 (1),3700000,3700000,3700000,",
      "욕실,욕실나라,철거·방수 (1),4000000,,,",
      "욕실,하루바스,타일 덧방 (2),2500000,2500000,2500000,예산 외",
      '계,,,,5500000,3700000,"예산 외 2,500,000원 제외"',
    ]);
  });

  it("표 머리: 지출 완료 뒤에 '예산 외 2,500,000원', 남은 예산은 반영분만", () => {
    expect(headingLineOf(makeOffBudgetPlanE())).toBe(
      "2026-11-06 기준 · 총 예산 10,000,000원 · 지출 예정 1,800,000원 · 지출 완료 3,700,000원 · 예산 외 2,500,000원 · 남은 예산 4,500,000원",
    );
  });
});

describe("AC-6 예시 G: 예산 외 줄만 [완료]", () => {
  it("완료 열이 있고 '계' 완료 칸은 0, 표 머리에 '지출 완료 0원'과 '예산 외 2,500,000원'", () => {
    const table = tableOf(makeOffBudgetPlanG());
    expect(table.columns).toContain("done");
    expect(table.doneTotal).toBe(0);
    expect(csvLinesOf(makeOffBudgetPlanG()).at(-1)).toBe(
      '계,,,,5500000,0,"예산 외 2,500,000원 제외"',
    );
    expect(headingLineOf(makeOffBudgetPlanG())).toBe(
      "2026-11-06 기준 · 총 예산 10,000,000원 · 지출 예정 5,500,000원 · 지출 완료 0원 · 예산 외 2,500,000원 · 남은 예산 4,500,000원",
    );
  });
});

describe("AC-3 예시 F: 계 비고", () => {
  it("'금액 미정 1건 제외 · 예산 외 2,500,000원 제외' 한 문자열(미정 먼저, R10 미정·R11 미확정은 안 더함)", () => {
    expect(tableOf(makeOffBudgetPlanF()).totalNote).toStrictEqual(
      "금액 미정 1건 제외 · 예산 외 2,500,000원 제외",
    );
  });

  it("미확정 예산 외 R11도 줄 비고는 '예산 외'(U9), 확정 칸은 빈칸", () => {
    const r11 = tableOf(makeOffBudgetPlanF())
      .groups.flatMap((group) => group.rows)
      .find((row) => row.detail === "안방 포인트");
    expect(r11).toMatchObject({ confirmedWon: undefined, note: "예산 외" });
  });
});
