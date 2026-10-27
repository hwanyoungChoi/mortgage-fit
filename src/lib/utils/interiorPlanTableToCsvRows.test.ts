// 스펙 interior-planner "CSV — 행", AC-12(a)(b)(태스크 5-2): 표 → 문자열 행 → toCsv가 "Q CSV"와 같고,
// 사용자 입력(업체·공종·메모)은 주입 접두를 받지만 세부내용·숫자 열은 받지 않는다.
import { describe, expect, it } from "vitest";

import { makePlanP, P_SPACES, pTime } from "@/test/interiorPlanFixture";
import { makePlanQ, Q_CSV, Q_CSV_LINES, qAircon } from "@/test/interiorPlanTableFixture";

import { buildInteriorPlanTable } from "./buildInteriorPlanTable";
import { interiorPlanTableToCsvRows } from "./interiorPlanTableToCsvRows";
import { summarizeInteriorPlan } from "./summarizeInteriorPlan";
import { toCsv } from "./toCsv";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const NOW = new Date(2026, 9, 27, 12, 0, 0);

const rowsOf = (plan: InteriorPlanWithItems) =>
  interiorPlanTableToCsvRows(buildInteriorPlanTable(summarizeInteriorPlan(plan, NOW).tradeGroups));

const csvOf = (plan: InteriorPlanWithItems) => toCsv(rowsOf(plan));

const HEADER = ["구분", "업체", "세부내용", "견적(원)", "확정(원)", "비고"];

describe("interiorPlanTableToCsvRows — Q", () => {
  it("열 제목 → 데이터 줄(구분 매 줄 반복) → 계 줄, 금액은 쉼표 없는 정수, 빈칸은 빈 필드", () => {
    expect(rowsOf(makePlanQ())).toEqual([
      HEADER,
      [
        "욕실",
        "숨고_하루바스",
        "[욕실1] 철거, 방수, 도기 교체",
        "3700000",
        "3700000",
        "폐기물처리 포함 · 예산 대비 700,000원 초과",
      ],
      ["욕실", "동네욕실", "[욕실2]", "2300000", "", "미확정 · 견적 2개 중 최저"],
      ["필름", "숨고_빛인테리어필름", "[전체] 샷시·몰딩", "2000000", "2000000", ""],
      ["바닥", "육문수", "[전체] 2.2T 장판", "1800000", "1800000", ""],
      ["에어컨", "", "[거실]", "", "", "추후 구매 · 예산 1,500,000원"],
      ["계", "", "", "9800000", "7500000", ""],
    ]);
  });

  it("toCsv까지: 스펙 'Q CSV'와 문자 단위로 같다(BOM 하나, 모든 줄 끝 CRLF)", () => {
    const csv = csvOf(makePlanQ());
    expect(csv).toBe(Q_CSV);
    expect(csv.slice(1).split("\r\n")).toEqual([...Q_CSV_LINES, ""]);
  });
});

describe("interiorPlanTableToCsvRows — P와 합계 0", () => {
  it("P: 샷시 E샷시 12500000/12500000 → 타일 → 도배 → 주방가구, 계 21800000/15300000", () => {
    expect(rowsOf(makePlanP())).toEqual([
      HEADER,
      ["샷시", "E샷시", "[전체]", "12500000", "12500000", "예산 대비 500,000원 초과"],
      ["타일", "C타일", "[욕실1]", "6500000", "", "미확정"],
      ["도배", "A도배", "[거실]", "2800000", "2800000", ""],
      ["주방가구", "", "[주방]", "", "", "예산 5,000,000원"],
      ["계", "", "", "21800000", "15300000", ""],
    ]);
  });

  it("q5만 있는 플랜: 계 줄 '0'·'0'(빈칸 아님)", () => {
    expect(csvOf(makePlanQ({ items: [qAircon()] }))).toBe(
      "﻿" +
        "구분,업체,세부내용,견적(원),확정(원),비고\r\n" +
        '에어컨,,[거실],,,"추후 구매 · 예산 1,500,000원"\r\n' +
        "계,,,0,0,\r\n",
    );
  });

  it("항목 0개(groups [])면 열 제목과 계 0/0", () => {
    expect(interiorPlanTableToCsvRows({ groups: [], totals: { quote: 0, confirmed: 0 } })).toEqual([
      HEADER,
      ["계", "", "", "0", "0", ""],
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
    expect(rowsOf(makePlanP({ items: [max] }))[1].slice(3, 5)).toEqual([
      "9999999990000",
      "9999999990000",
    ]);
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
  /** 항목 하나짜리 플랜의 CSV 데이터 줄(BOM·열 제목·계 줄 뺀 한 줄) */
  const dataLine = (one: InteriorItem) => {
    const lines = csvOf(makePlanP({ items: [one] })).split("\r\n");
    expect(lines).toHaveLength(4);
    return lines[1];
  };

  it("업체 '@하루바스' → `'@하루바스`, 세부내용([로 시작)·숫자 열에는 접두 없음", () => {
    const one = base({
      quotes: [{ id: "q", vendor: "@하루바스", amount: 370, memo: "=메모" }],
      confirmedQuoteId: "q",
    });
    expect(dataLine(one)).toBe("욕실,'@하루바스,[욕실1] =메모,3700000,3700000,");
  });

  it("직접 입력 공종 '-추가' → 구분 `'-추가`", () => {
    expect(dataLine(base({ trade: "-추가" }))).toBe("'-추가,,[욕실1],,,");
  });

  it("견적·예산 없는 항목의 메모 '=SUM(A1)' → 비고 `'=SUM(A1)`", () => {
    expect(dataLine(base({ memo: "=SUM(A1)" }))).toBe("욕실,,[욕실1],,,'=SUM(A1)");
  });

  it('업체 \'하루"바스\' → `"하루""바스"`', () => {
    const one = base({ quotes: [{ id: "q", vendor: '하루"바스', amount: 1 }] });
    expect(dataLine(one)).toBe('욕실,"하루""바스",[욕실1],10000,,미확정');
  });

  it("항목 메모 '줄1'(LF)'줄2' → 큰따옴표 안에 LF 그대로", () => {
    const csv = csvOf(makePlanP({ items: [base({ memo: "줄1\n줄2" })] }));
    expect(csv).toContain('욕실,,[욕실1],,,"줄1\n줄2"\r\n');
  });

  it("비고 맨 앞이 '+'인 항목 메모와 쉼표 조각이 함께면 접두 뒤 감싼다", () => {
    expect(dataLine(base({ memo: "+추가", budget: 150 }))).toBe(
      '욕실,,[욕실1],,,"\'+추가 · 예산 1,500,000원"',
    );
  });
});
