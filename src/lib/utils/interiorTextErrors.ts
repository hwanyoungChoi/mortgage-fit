import {
  INTERIOR_PLAN_NAME_MAX_LENGTH,
  INTERIOR_SPACE_NAME_MAX_LENGTH,
} from "@/lib/constants/interiorPlan";

import { countChars } from "./validateListingName";

// 인테리어 플랜 입력칸의 글자 오류. 길이는 앞뒤 공백을 뗀 코드포인트 수로 센다(공용 검증과 같다).

/** 선택 글자: 길면 "n자 이하로 입력하세요(현재 m자)" */
export function optionalTextError(raw: string, maxLength: number): string | null {
  const length = countChars(raw.trim());
  return length > maxLength ? `${maxLength}자 이하로 입력하세요(현재 ${length}자)` : null;
}

/** 필수 글자: 빈칸이면 `emptyMessage`, 길면 선택 글자와 같은 오류 */
export function requiredTextError(
  raw: string,
  maxLength: number,
  emptyMessage: string,
): string | null {
  if (raw.trim() === "") return emptyMessage;
  return optionalTextError(raw, maxLength);
}

export function interiorPlanNameError(raw: string): string | null {
  return requiredTextError(raw, INTERIOR_PLAN_NAME_MAX_LENGTH, "계획 이름을 입력하세요");
}

export function interiorSpaceNameError(raw: string): string | null {
  return requiredTextError(raw, INTERIOR_SPACE_NAME_MAX_LENGTH, "공간 이름을 입력하세요");
}
