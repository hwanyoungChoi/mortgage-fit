import type { AccountSourceStatus, MeResponse } from "@/lib/types/account";

type AccountSourceStatusInput = {
  me: MeResponse | undefined;
  isMeError: boolean;
  /** 이 브라우저가 로그인한 적이 있다(`session-hint`) */
  hasSessionHint: boolean;
  /** 이 사용자의 이 기기 데이터 이전이 끝났거나 건너뛰기로 정해졌다 */
  isImportSettled: (userId: string) => boolean;
};

/**
 * `/api/me` 결과 → 출처. 받아 둔 응답이 있으면 재조회가 실패해도 그 값을 쓴다.
 * 로그인했으면 이 기기 데이터의 이전이 끝난 뒤에 loggedIn이다(이전 중 빈 서버 목록이 보이지 않게, AC-13c).
 * 응답이 없이 실패하면, 로그인했던 브라우저만 error로 막는다. 로그인한 적 없는 사용자는
 * 서버 장애와 상관없이 지금처럼 로컬로 쓴다(AC-0).
 */
export function selectAccountSourceStatus({
  me,
  isMeError,
  hasSessionHint,
  isImportSettled,
}: AccountSourceStatusInput): AccountSourceStatus {
  if (me !== undefined) {
    if (me.user === null) return "loggedOut";
    return isImportSettled(me.user.id) ? "loggedIn" : "loading";
  }
  if (!isMeError) return "loading";
  return hasSessionHint ? "error" : "loggedOut";
}
