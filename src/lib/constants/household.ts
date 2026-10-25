/** 초대 토큰 모양: 16바이트 base64url(22자). 대소문자를 구분한다. 서버도 같은 모양만 받는다. */
export const HOUSEHOLD_INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/**
 * 함께 쓰는 중일 때만 me·목록·예산·순서를 이 간격으로 다시 조회한다(ADR-028 D2). 숨은 탭에서는 멈춘다(react-query 기본값).
 * 혼자 쓰는 사용자는 주기 조회를 하지 않는다(AC-0).
 */
export const HOUSEHOLD_REFETCH_INTERVAL_MS = 30_000;
