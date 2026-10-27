import { describe, expect, it } from "vitest";

import {
  formatManwon,
  formatManwonOrDash,
  formatWonKorean,
  isBelowManwonWonInput,
  parseAmount,
  validateAmount,
  validateWonAmount,
} from "./amount";

// 메시지는 제품 상수가 아니라 스펙 "입력 검증 규칙" 표의 문구로 단언한다.
const NOT_POSITIVE = "0보다 큰 금액을 입력하세요";
const NOT_NUMBER = "숫자만 입력하세요";
const NOT_INTEGER = "정수(만원 단위)로 입력하세요";
const TOO_LARGE = "최대 9자리(999,999,999만원)까지 입력할 수 있습니다";

describe("parseAmount", () => {
  it.each(["", " ", "   ", "\t"])("빈 값·공백만(%j)은 empty", (raw) => {
    expect(parseAmount(raw)).toEqual({ kind: "empty" });
  });

  it.each([
    ["125000", 125000],
    ["125,000", 125000],
    ["  125000  ", 125000],
    ["0012", 12],
  ])("%j → value %i", (raw, value) => {
    expect(parseAmount(raw)).toEqual({ kind: "value", value });
  });

  it.each(["-5", "12a", "1 000", "12.5"])("%j는 invalid", (raw) => {
    expect(parseAmount(raw)).toEqual({ kind: "invalid" });
  });
});

describe("validateAmount (AC-8a, 입력 검증 규칙 표)", () => {
  it.each(["", " ", "   ", "\t"])("빈 값·공백만(%j)은 오류가 아닌 empty", (raw) => {
    expect(validateAmount(raw)).toEqual({ status: "empty" });
  });

  it.each([
    ["125000", 125000],
    ["125,000", 125000],
    ["1,250,00", 125000],
    [" 125000 ", 125000],
    ["0012", 12],
    ["1", 1],
    ["999999999", 999999999],
    ["999,999,999", 999999999],
    ["0999999999", 999999999],
  ])("%j → valid %i", (raw, value) => {
    expect(validateAmount(raw)).toEqual({ status: "valid", value });
  });

  it.each(["0", "000", "0,000"])("%j → 0보다 큰 금액 오류", (raw) => {
    expect(validateAmount(raw)).toEqual({ status: "error", message: NOT_POSITIVE });
  });

  it.each(["-5", "12a", "1 000", "abc", "1e5", "+5"])("%j → 숫자만 오류", (raw) => {
    expect(validateAmount(raw)).toEqual({ status: "error", message: NOT_NUMBER });
  });

  it.each(["12.5", "0.5"])("%j → 정수 오류", (raw) => {
    expect(validateAmount(raw)).toEqual({ status: "error", message: NOT_INTEGER });
  });

  it.each(["1000000000", "1,000,000,000", "9999999999", "99999999999999999999"])(
    "%j(앞의 0을 뗀 10자리 이상) → 최대 9자리 오류",
    (raw) => {
      expect(validateAmount(raw)).toEqual({ status: "error", message: TOO_LARGE });
    },
  );
});

describe("formatManwon (AC-8a, 경계표)", () => {
  it.each([
    [0, "0만원"],
    [1, "1만원"],
    [9999, "9,999만원"],
    [10000, "1억원"],
    [10001, "1억 1만원"],
    [100000, "10억원"],
    [125000, "12억 5,000만원"],
    [999999999, "99,999억 9,999만원"],
  ])("%i → %s", (n, expected) => {
    expect(formatManwon(n)).toBe(expected);
  });
});

describe("formatManwonOrDash", () => {
  it("null은 0으로 채우지 않고 —로 보여준다", () => {
    expect(formatManwonOrDash(null)).toBe("—");
  });

  it("0은 0만원이다(미확인과 구분)", () => {
    expect(formatManwonOrDash(0)).toBe("0만원");
  });
});

// ADR-034 2단계: 우리 집 견적·총 예산의 원 입력. 문구는 스펙·ADR 문장 그대로 단언한다.
describe("validateWonAmount (원 정수, 하한은 부르는 쪽)", () => {
  it.each(["", "   "])("%j → empty(견적은 미정, 총 예산은 지움)", (raw) => {
    expect(validateWonAmount(raw, 0)).toEqual({ status: "empty" });
    expect(validateWonAmount(raw, 1)).toEqual({ status: "empty" });
  });

  it.each([
    ["0", 0, 0],
    ["1", 1, 1],
    ["9999", 0, 9999],
    ["1,234,500", 1, 1_234_500],
    ["1000000000", 1, 1_000_000_000],
    ["9999999999999", 1, 9_999_999_999_999],
  ])("%j (하한 %i) → valid %i", (raw, min, value) => {
    expect(validateWonAmount(raw, min)).toEqual({ status: "valid", value });
  });

  it.each([
    ["0", 1, "0보다 큰 금액을 입력하세요"],
    ["-1", 0, NOT_NUMBER],
    ["12a", 0, NOT_NUMBER],
    ["1.5", 0, "정수(원 단위)로 입력하세요"],
    ["10000000000000", 0, "최대 13자리(9,999,999,999,999원)까지 입력할 수 있습니다"],
  ])("%j (하한 %i) → 오류 %j", (raw, min, message) => {
    expect(validateWonAmount(raw, min)).toEqual({ status: "error", message });
  });
});

describe("isBelowManwonWonInput (1만원 미만 안내)", () => {
  it.each([
    ["1", true],
    ["999", true],
    ["9,999", true],
    ["10000", false],
    ["0", false],
    ["", false],
    ["12a", false],
  ])("%j → %s", (raw, expected) => {
    expect(isBelowManwonWonInput(raw)).toBe(expected);
  });
});

describe("formatWonKorean (입력 칸 힌트, 억·만)", () => {
  it.each([
    [0, "0원"],
    [999, "999원"],
    [10_000, "1만원"],
    [1_234_500, "123만 4,500원"],
    [12_000_000, "1,200만원"],
    [100_000_000, "1억원"],
    [123_456_789, "1억 2,345만 6,789원"],
    [100_000_001, "1억 1원"],
    [9_999_999_999_999, "99,999억 9,999만 9,999원"],
  ])("%i → %j", (won, text) => {
    expect(formatWonKorean(won)).toBe(text);
  });
});
