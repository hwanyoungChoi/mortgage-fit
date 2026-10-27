// 1단계 전용 임시 코드(ADR-034 조건 6). 입력이 아직 만원이라 원 단위 금액을 시트 칸에 채울 때만 쓴다.
// 2단계(원 입력)에서 이 파일과 줄 시트·설정 시트의 안내 문구를 함께 지운다.
import { WON_PER_MANWON } from "@/lib/constants/interiorPlan";

/** 만원 칸에 담을 수 없는 원 금액으로 시트를 열었을 때 견적·총 예산 칸 아래 안내 */
export const WON_ONLY_AMOUNT_NOTICE =
  "원 단위로 저장된 금액이라 이 화면에서는 만원으로 다시 입력하세요";

/**
 * 원 금액 → 만원 입력 칸 글자. 10,000으로 나누어떨어지고 0보다 크면 만원("1200"), 아니면 ""(1,234,500·0·999).
 * 0은 1단계 만원 입력이 받지 않는 값이라 빈칸으로 연다. 금액이 없으면(undefined) "".
 */
export function manwonInputTextOf(won: number | undefined): string {
  if (won === undefined || won <= 0 || won % WON_PER_MANWON !== 0) return "";
  return String(won / WON_PER_MANWON);
}

/** 금액은 있지만 만원 칸에 담을 수 없어 빈칸으로 여는가(안내를 보인다) */
export function isWonOnlyAmount(won: number | undefined): boolean {
  return won !== undefined && manwonInputTextOf(won) === "";
}
