// 스펙 interior-simple AC-5 CSV(BOM·CRLF·수식 주입 규칙은 이전 스펙 AC-12(a)(b) 그대로): 표 → 문자열 행 → toCsv.
// 사용자 입력(업체·구분·세부내용·메모)은 주입 접두를 받고 숫자 열은 받지 않는다.
import { describe, expect, it } from "vitest";

import { makePlanP, P_SPACES, pTime } from "@/test/interiorPlanFixture";
import { makePlanQ, Q_CSV, Q_CSV_LINES, qAircon } from "@/test/interiorPlanTableFixture";
import {
  LEGACY_L_CSV_LINES,
  makePlanL,
  makeSimplePlanP,
  SIMPLE_P_CSV_LINES,
  toCsvFile,
} from "@/test/interiorSimpleFixture";

import { buildInteriorPlanTable } from "./buildInteriorPlanTable";
import { buildInteriorPlanRows } from "./interiorPlanRows";
import { interiorPlanTableToCsvRows } from "./interiorPlanTableToCsvRows";
import { toCsv } from "./toCsv";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const rowsOf = (plan: Pick<InteriorPlanWithItems, "items">) =>
  interiorPlanTableToCsvRows(buildInteriorPlanTable(buildInteriorPlanRows(plan)));

const csvOf = (plan: Pick<InteriorPlanWithItems, "items">) => toCsv(rowsOf(plan));

const HEADER = ["구분", "업체", "세부내용", "견적(원)", "확정(원)", "비고"];

describe("interiorPlanTableToCsvRows — 예시 P·옛 계획 L (AC-5)", () => {
  it("P: 정확히 7행(머리 + 줄 5 + 계), 계는 확정 칸만", () => {
    const csv = csvOf(makeSimplePlanP());
    expect(csv).toBe(toCsvFile(SIMPLE_P_CSV_LINES));
    expect(csv.slice(1).split("\r\n")).toEqual([...SIMPLE_P_CSV_LINES, ""]);
    expect(SIMPLE_P_CSV_LINES).toHaveLength(7);
  });

  it("L: 정확히 6행, 빈 줄 비고 '예산 2,000,000원'은 쉼표 때문에 따옴표, 옛 비고 조각 없음", () => {
    const csv = csvOf(makePlanL());
    expect(csv).toBe(toCsvFile(LEGACY_L_CSV_LINES));
    expect(LEGACY_L_CSV_LINES).toHaveLength(6);
    expect(csv).not.toMatch(/미확정|최저|초과/);
  });
});

describe("interiorPlanTableToCsvRows — Q", () => {
  it("열 제목 → 데이터 줄(구분 매 줄 반복) → 계 줄, 금액은 쉼표 없는 정수, 빈칸은 빈 필드", () => {
    expect(rowsOf(makePlanQ())).toEqual([
      HEADER,
      ["바닥", "육문수", "2.2T 장판", "1800000", "1800000", ""],
      ["필름", "숨고_빛인테리어필름", "샷시·몰딩", "2000000", "2000000", ""],
      ["욕실", "숨고_하루바스", "철거, 방수, 도기 교체", "3700000", "3700000", "폐기물처리 포함"],
      ["욕실", "욕실나라", "", "4000000", "", "폐기물처리 포함"],
      ["욕실", "숨고_하루바스", "타일 덧방", "2500000", "", ""],
      ["욕실", "동네욕실", "", "2300000", "", ""],
      ["에어컨", "", "", "", "", "추후 구매 · 예산 1,500,000원"],
      ["계", "", "", "", "7500000", ""],
    ]);
  });

  it("toCsv까지: 'Q CSV'와 문자 단위로 같다(BOM 하나, 모든 줄 끝 CRLF)", () => {
    const csv = csvOf(makePlanQ());
    expect(csv).toBe(Q_CSV);
    expect(csv.slice(1).split("\r\n")).toEqual([...Q_CSV_LINES, ""]);
  });
});

describe("interiorPlanTableToCsvRows — 옛 P와 합계 0", () => {
  it("옛 P: 도배 A도배 2800000/2800000 · B도배 → 타일 → 샷시 D · E 12500000/12500000 → 주방가구, 계 15300000", () => {
    expect(rowsOf(makePlanP())).toEqual([
      HEADER,
      ["도배", "A도배", "", "2800000", "2800000", ""],
      ["도배", "B도배", "", "3200000", "", ""],
      ["타일", "C타일", "", "6500000", "", ""],
      ["샷시", "D샷시", "", "11500000", "", ""],
      ["샷시", "E샷시", "", "12500000", "12500000", ""],
      ["주방가구", "", "", "", "", "예산 5,000,000원"],
      ["계", "", "", "", "15300000", ""],
    ]);
  });

  it("q5만 있는 계획: 계 줄 '0'(빈칸 아님)", () => {
    expect(csvOf(makePlanQ({ items: [qAircon()] }))).toBe(
      "﻿" +
        "구분,업체,세부내용,견적(원),확정(원),비고\r\n" +
        '에어컨,,,,,"추후 구매 · 예산 1,500,000원"\r\n' +
        "계,,,,0,\r\n",
    );
  });

  it("줄 0개(groups [])면 열 제목과 계 0", () => {
    expect(interiorPlanTableToCsvRows({ groups: [], confirmedTotal: 0 })).toEqual([
      HEADER,
      ["계", "", "", "", "0", ""],
    ]);
  });

  it("최대 금액 한 줄 → '9999999990000'(지수 표기 없음)", () => {
    const max: InteriorItem = {
      id: "max",
      spaceId: P_SPACES[0].id,
      trade: "도배",
      quotes: [{ id: "mq", vendor: "업체", amount: 999_999_999 }],
      confirmedQuoteId: "mq",
      status: "confirmed",
      createdAt: pTime(1),
      updatedAt: pTime(1),
    };
    expect(rowsOf({ items: [max] })[1].slice(3, 5)).toEqual(["9999999990000", "9999999990000"]);
  });
});

describe("CSV 주입·이스케이프 — 사용자 입력이 표를 거쳐 파일에 들어갈 때 (AC-12(b))", () => {
  const base = (fields: Partial<InteriorItem>): InteriorItem => ({
    id: "inj",
    spaceId: "sp-bath1",
    trade: "욕실",
    status: "planned",
    createdAt: pTime(1),
    updatedAt: pTime(1),
    ...fields,
  });
  /** 항목 하나짜리 계획의 CSV 데이터 줄(BOM·열 제목·계 줄 뺀 한 줄) */
  const dataLine = (one: InteriorItem) => {
    const lines = csvOf({ items: [one] }).split("\r\n");
    expect(lines).toHaveLength(4);
    return lines[1];
  };

  it("업체 '@하루바스' → `'@하루바스`, 세부내용 '=메모' → `'=메모`, 숫자 열에는 접두 없음", () => {
    const one = base({
      quotes: [{ id: "q", vendor: "@하루바스", amount: 370, memo: "=메모" }],
      confirmedQuoteId: "q",
    });
    expect(dataLine(one)).toBe("욕실,'@하루바스,'=메모,3700000,3700000,");
  });

  it("직접 입력 구분 '-추가' → 구분 `'-추가`", () => {
    expect(dataLine(base({ trade: "-추가" }))).toBe("'-추가,,,,,");
  });

  it("견적·예산 없는 항목의 메모 '=SUM(A1)' → 비고 `'=SUM(A1)`", () => {
    expect(dataLine(base({ memo: "=SUM(A1)" }))).toBe("욕실,,,,,'=SUM(A1)");
  });

  it('업체 \'하루"바스\' → `"하루""바스"`', () => {
    const one = base({ quotes: [{ id: "q", vendor: '하루"바스', amount: 1 }] });
    expect(dataLine(one)).toBe('욕실,"하루""바스",,10000,,');
  });

  it("항목 메모 '줄1'(LF)'줄2' → 큰따옴표 안에 LF 그대로", () => {
    const csv = csvOf({ items: [base({ memo: "줄1\n줄2" })] });
    expect(csv).toContain('욕실,,,,,"줄1\n줄2"\r\n');
  });

  it("비고 맨 앞이 '+'인 항목 메모와 쉼표 조각이 함께면 접두 뒤 감싼다", () => {
    expect(dataLine(base({ memo: "+추가", budget: 150 }))).toBe(
      '욕실,,,,,"\'+추가 · 예산 1,500,000원"',
    );
  });
});
