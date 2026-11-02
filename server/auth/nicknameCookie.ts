// 홈에 보여 줄 카카오 닉네임(ADR-037). DB에 저장하지 않고 이 브라우저의 쿠키에만 둔다.
// 세션이 살아 있을 때만 `/api/me`가 돌려주므로 수명은 연장되는 세션보다 길게 잡는다. 스스로 고쳐도 자기 화면 글자만 바뀐다.
import { readCookie } from "../http/readCookie";

const NICKNAME_COOKIE = "mf_nickname";
const NICKNAME_COOKIE_ATTRIBUTES = "HttpOnly; Secure; SameSite=Lax; Path=/api";
const NICKNAME_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** 닉네임 쿠키. 닉네임이 없으면(동의하지 않음·철회, 로그아웃) 지우는 쿠키다. */
export function nicknameCookie(nickname: string | undefined): string {
  return nickname === undefined
    ? `${NICKNAME_COOKIE}=; ${NICKNAME_COOKIE_ATTRIBUTES}; Max-Age=0`
    : `${NICKNAME_COOKIE}=${encodeURIComponent(nickname)}; ${NICKNAME_COOKIE_ATTRIBUTES}; Max-Age=${NICKNAME_MAX_AGE_SECONDS}`;
}

/** 쿠키가 없거나 비었거나 깨졌으면 undefined */
export function readNickname(request: Request): string | undefined {
  const value = readCookie(request, NICKNAME_COOKIE);
  if (value === null || value === "") return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}
