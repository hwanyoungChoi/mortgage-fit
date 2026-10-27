// 스펙 interior-planner "CSV — 이스케이프(RFC 4180)·수식 주입 대응", AC-12(b)(태스크 5-2). toCsv는 인테리어를 모른다.
import { describe, expect, it } from "vitest";

import { toCsv } from "./toCsv";

const BOM = "﻿";

/** 셀 하나짜리 한 줄의 필드(앞 BOM·끝 CRLF를 뗀 것) */
const field = (cell: string) => {
  const csv = toCsv([[cell]]);
  expect(csv.startsWith(BOM)).toBe(true);
  expect(csv.endsWith("\r\n")).toBe(true);
  return csv.slice(BOM.length, -2);
};

describe("toCsv 이스케이프 (RFC 4180)", () => {
  it.each([
    ['하루"바스', '"하루""바스"'],
    ['""', '""""""'],
    ["줄1\n줄2", '"줄1\n줄2"'],
    ["줄1\r\n줄2", '"줄1\r\n줄2"'],
    ["줄1\r줄2", '"줄1\r줄2"'],
    ["a,b", '"a,b"'],
    ["추후 구매 · 예산 1,500,000원", '"추후 구매 · 예산 1,500,000원"'],
    ["미확정 · 견적 2개 중 최저", "미확정 · 견적 2개 중 최저"],
    ["견적(원)", "견적(원)"],
    ["", ""],
    [" 앞뒤 공백 ", " 앞뒤 공백 "],
  ])("%j → %j", (cell, expected) => {
    expect(field(cell)).toBe(expected);
  });
});

describe("toCsv 수식 주입 접두 (접두 먼저 · 이스케이프 나중)", () => {
  it.each([
    ["=SUM(A1)", "'=SUM(A1)"],
    ["+1", "'+1"],
    ["-", "'-"],
    ["-추가", "'-추가"],
    ["@하루바스", "'@하루바스"],
    ["\t탭", "'\t탭"],
    // CR·LF로 시작하면 접두 뒤 큰따옴표로 감싼다
    ["\r줄", '"\'\r줄"'],
    ["\n줄", '"\'\n줄"'],
    // 전각
    ["＝1", "'＝1"],
    ["＋1", "'＋1"],
    ["－1", "'－1"],
    ["＠x", "'＠x"],
    // 순서: 접두를 먼저 붙이고 감싼다(뒤집히면 '"=1,2"가 된다)
    ["=1,2", '"\'=1,2"'],
    ['=a"b', '"\'=a""b"'],
  ])("%j → %j", (cell, expected) => {
    expect(field(cell)).toBe(expected);
  });

  it.each([
    ["'=1", "'=1"],
    ["'이미", "'이미"],
    ["a=1", "a=1"],
    ["1+1", "1+1"],
    ["a-b", "a-b"],
    ["[욕실1] =메모", "[욕실1] =메모"],
    ["1800000", "1800000"],
    ["0", "0"],
    ["999999999000000", "999999999000000"],
    [" =1", " =1"],
  ])("접두 없음: %j → %j", (cell, expected) => {
    expect(field(cell)).toBe(expected);
  });
});

describe("toCsv 파일 모양", () => {
  it("맨 앞 BOM 하나, 필드는 쉼표, 모든 줄 끝(마지막 줄 포함) CRLF", () => {
    const csv = toCsv([
      ["구분", "업체"],
      ["욕실", ""],
    ]);
    expect(csv).toBe(`${BOM}구분,업체\r\n욕실,\r\n`);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.charCodeAt(1)).not.toBe(0xfeff);
    // 첫 필드에 접두·따옴표가 붙지 않는다
    expect(csv.slice(1, 3)).toBe("구분");
    // LF만 있는 줄 끝이 없다
    expect(csv.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("빈 배열이면 BOM만", () => {
    expect(toCsv([])).toBe(BOM);
  });

  it("빈 셀만 있는 줄도 쉼표 개수가 맞다", () => {
    expect(toCsv([["", "", ""]])).toBe(`${BOM},,\r\n`);
  });

  it("여러 줄이어도 BOM은 맨 앞 하나(줄마다 붙지 않음)", () => {
    expect(toCsv([["a"], ["b"], ["c"]])).toBe(`${BOM}a\r\nb\r\nc\r\n`);
  });
});
