/** 입력 가능한 최대 금액(만원, 9자리) */
export const MAX_AMOUNT = 999_999_999;

export const AMOUNT_ERROR_MESSAGES = {
  notPositive: "0보다 큰 금액을 입력하세요",
  notNumber: "숫자만 입력하세요",
  notInteger: "정수(만원 단위)로 입력하세요",
  tooLarge: "최대 9자리(999,999,999만원)까지 입력할 수 있습니다",
};

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

/** 계산하지 않은 금액(null)은 "—"로 보여준다. 0으로 대신 채우지 않는다. */
export function formatManwonOrDash(n: number | null): string {
  return n === null ? "—" : formatManwon(n);
}
