// 공유 검증(server/)의 전이 의존이라 `@/` 별칭을 쓰지 않는다
import { MAX_WON } from "../constants/interiorPlan";

/** 입력 가능한 최대 금액(만원, 9자리) */
export const MAX_AMOUNT = 999_999_999;

export const AMOUNT_ERROR_MESSAGES = {
  notPositive: "0보다 큰 금액을 입력하세요",
  notNumber: "숫자만 입력하세요",
  notInteger: "정수(만원 단위)로 입력하세요",
  tooLarge: "최대 9자리(999,999,999만원)까지 입력할 수 있습니다",
};

/** 원 단위 입력(우리 집 견적·총 예산, ADR-034)의 오류. 0·숫자 아님은 만원과 같은 문구다 */
export const WON_AMOUNT_ERROR_MESSAGES = {
  notPositive: AMOUNT_ERROR_MESSAGES.notPositive,
  notNumber: AMOUNT_ERROR_MESSAGES.notNumber,
  notInteger: "정수(원 단위)로 입력하세요",
  tooLarge: "최대 13자리(9,999,999,999,999원)까지 입력할 수 있습니다",
};

const WON_PER_MAN = 10_000;
const WON_PER_EOK = 100_000_000;

export type ParsedAmount =
  { kind: "empty" } | { kind: "value"; value: number } | { kind: "invalid" };

export type AmountValidation =
  { status: "empty" } | { status: "valid"; value: number } | { status: "error"; message: string };

const DIGITS_PATTERN = /^\d+$/;
const DECIMAL_PATTERN = /^\d+\.\d+$/;

const numberFormat = new Intl.NumberFormat("ko-KR");

/** 앞뒤 공백과 쉼표를 뗀다. 붙여넣은 "125,000"도 숫자로 읽기 위해서다. */
export function stripAmountFormatting(raw: string): string {
  return raw.trim().replaceAll(",", "");
}

export function parseAmount(raw: string): ParsedAmount {
  const normalized = stripAmountFormatting(raw);
  if (normalized === "") return { kind: "empty" };
  if (!DIGITS_PATTERN.test(normalized)) return { kind: "invalid" };
  return { kind: "value", value: Number(normalized) };
}

export function validateAmount(raw: string): AmountValidation {
  const parsed = parseAmount(raw);
  if (parsed.kind === "empty") return { status: "empty" };
  if (parsed.kind === "invalid") {
    const isDecimal = DECIMAL_PATTERN.test(stripAmountFormatting(raw));
    return {
      status: "error",
      message: isDecimal ? AMOUNT_ERROR_MESSAGES.notInteger : AMOUNT_ERROR_MESSAGES.notNumber,
    };
  }
  if (parsed.value === 0) return { status: "error", message: AMOUNT_ERROR_MESSAGES.notPositive };
  if (parsed.value > MAX_AMOUNT) {
    return { status: "error", message: AMOUNT_ERROR_MESSAGES.tooLarge };
  }
  return { status: "valid", value: parsed.value };
}

/**
 * 원 단위 입력 칸 글자 → 검증 결과. 하한은 부르는 쪽이 정한다(`QUOTE_MIN_WON`·`PLAN_BUDGET_MIN_WON`). 상한은 `MAX_WON`.
 * 빈칸(공백만 포함)은 empty다. 견적은 미정, 총 예산은 지움으로 읽는다.
 */
export function validateWonAmount(raw: string, min: number): AmountValidation {
  const parsed = parseAmount(raw);
  if (parsed.kind === "empty") return { status: "empty" };
  if (parsed.kind === "invalid") {
    const isDecimal = DECIMAL_PATTERN.test(stripAmountFormatting(raw));
    return {
      status: "error",
      message: isDecimal
        ? WON_AMOUNT_ERROR_MESSAGES.notInteger
        : WON_AMOUNT_ERROR_MESSAGES.notNumber,
    };
  }
  if (parsed.value < min) {
    return { status: "error", message: WON_AMOUNT_ERROR_MESSAGES.notPositive };
  }
  if (parsed.value > MAX_WON) {
    return { status: "error", message: WON_AMOUNT_ERROR_MESSAGES.tooLarge };
  }
  return { status: "valid", value: parsed.value };
}

/**
 * 원 입력 칸에 1만원 미만(1~9,999원)이 들어 있는가. 만원으로 적던 사용자가 "800"(= 800원)을 넣는 실수를 알린다.
 * 저장은 막지 않는다(소액도 맞는 값). 0은 셀프 시공이라 알리지 않는다.
 */
export function isBelowManwonWonInput(raw: string): boolean {
  const parsed = parseAmount(raw);
  return parsed.kind === "value" && parsed.value >= 1 && parsed.value < WON_PER_MAN;
}

/** 천 단위 쉼표 */
export function formatThousands(n: number): string {
  return numberFormat.format(n);
}

/** 원 정수 → "1,234,500원"(천 단위 쉼표 + 원). 우리 집 목록·요약·허브·표 머리·비고가 같이 쓴다(ADR-034 조건 9) */
export function formatWon(won: number): string {
  return `${formatThousands(won)}원`;
}

/** 0 이상 정수(만원) → "12억 5,000만원" */
export function formatManwon(n: number): string {
  const eok = Math.floor(n / 10000);
  const man = n % 10000;
  if (eok === 0) return `${formatThousands(man)}만원`;
  if (man === 0) return `${formatThousands(eok)}억원`;
  return `${formatThousands(eok)}억 ${formatThousands(man)}만원`;
}

/**
 * 0 이상 원 정수 → "1억 2,345만 6,000원"(입력 칸 힌트 전용, ADR-034 조건 9). 0인 자리는 뺀다: 12,000,000 → "1,200만원".
 * 조 단위는 쓰지 않는다(`formatManwon`과 같은 관례): 9,999,999,999,999 → "99,999억 9,999만 9,999원"
 */
export function formatWonKorean(won: number): string {
  const eok = Math.floor(won / WON_PER_EOK);
  const man = Math.floor((won % WON_PER_EOK) / WON_PER_MAN);
  const rest = won % WON_PER_MAN;
  const parts = [
    ...(eok > 0 ? [`${formatThousands(eok)}억`] : []),
    ...(man > 0 ? [`${formatThousands(man)}만`] : []),
    ...(rest > 0 ? [formatThousands(rest)] : []),
  ];
  return parts.length === 0 ? "0원" : `${parts.join(" ")}원`;
}

/** 계산하지 않은 금액(null)은 "—"로 보여준다. 0으로 대신 채우지 않는다. */
export function formatManwonOrDash(n: number | null): string {
  return n === null ? "—" : formatManwon(n);
}
