import { fetchKakaoUserId } from "./kakaoApi";
import { createSession } from "./session";
import { createRandomId } from "../../src/lib/utils/createRandomId";
import { randomBase64url } from "../crypto/tokens";
import { isInviteToken } from "../household/handleHousehold";
import { readCookie } from "../http/readCookie";

import type { KakaoKeys } from "./kakaoApi";

const AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const STATE_COOKIE = "mf_oauth_state";
/** 초대 링크로 시작한 로그인의 초대 토큰(ADR-028 D3). state 쿠키와 같은 속성·수명 */
const INVITE_COOKIE = "mf_oauth_invite";
const STATE_COOKIE_ATTRIBUTES = "HttpOnly; Secure; SameSite=Lax; Path=/api/auth/kakao";
const STATE_MAX_AGE_SECONDS = 600;
const STATE_BYTES = 32;

const clearInviteCookie = `${INVITE_COOKIE}=; ${STATE_COOKIE_ATTRIBUTES}; Max-Age=0`;

/** 홈 화면이 `?login=`으로 받아 안내 한 줄을 보이는 값 */
type LoginResult = "cancelled" | "failed" | "notConfigured";

type KakaoEnv = { KAKAO_REST_API_KEY?: string; KAKAO_CLIENT_SECRET?: string };
type CallbackDeps = { fetch: typeof fetch; now: () => Date };

/** 시크릿 둘 중 하나라도 비면 null(→ notConfigured) */
function readKakaoKeys(env: KakaoEnv): KakaoKeys | null {
  const restApiKey = env.KAKAO_REST_API_KEY?.trim() ?? "";
  const clientSecret = env.KAKAO_CLIENT_SECRET?.trim() ?? "";
  return restApiKey === "" || clientSecret === "" ? null : { restApiKey, clientSecret };
}

/** 카카오에 등록한 Redirect URI와 같아야 한다(로그인 요청과 토큰 요청에 같은 값). */
const callbackUrl = (origin: string) => `${origin}/api/auth/kakao/callback`;

/** 로그인 뒤에는 홈으로 돌아간다(초대로 시작한 성공 로그인만 초대 화면). */
const homeUrl = (origin: string, result?: LoginResult) =>
  `${origin}/#/${result === undefined ? "" : `?login=${result}`}`;

function redirectResponse(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

const inviteUrl = (origin: string, token: string) => `${origin}/#/invite/${token}`;

/**
 * GET /api/auth/kakao/login[?invite={token}]. state 쿠키를 심고 카카오 인가 화면으로 보낸다. 키가 없으면 notConfigured.
 * 모양이 맞는 `invite`가 있으면 초대 쿠키를 심고, 없거나 틀리면 남아 있던 초대 쿠키를 지운다
 * (초대로 시작했다 그만둔 로그인 뒤의 보통 로그인이 초대 화면으로 가지 않게).
 */
export function startKakaoLogin(request: Request, env: KakaoEnv): Response {
  const url = new URL(request.url);
  const { origin } = url;
  const keys = readKakaoKeys(env);
  if (keys === null) {
    return redirectResponse(homeUrl(origin, "notConfigured"), [clearInviteCookie]);
  }

  const invite = url.searchParams.get("invite");
  const inviteCookie = isInviteToken(invite)
    ? `${INVITE_COOKIE}=${invite}; ${STATE_COOKIE_ATTRIBUTES}; Max-Age=${STATE_MAX_AGE_SECONDS}`
    : clearInviteCookie;

  const state = randomBase64url(STATE_BYTES);
  // 동의항목 없음(회원번호만): scope·prompt·nonce를 보내지 않는다.
  const authorizeParams = new URLSearchParams({
    client_id: keys.restApiKey,
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    state,
  });
  return redirectResponse(`${AUTHORIZE_URL}?${authorizeParams}`, [
    `${STATE_COOKIE}=${state}; ${STATE_COOKIE_ATTRIBUTES}; Max-Age=${STATE_MAX_AGE_SECONDS}`,
    inviteCookie,
  ]);
}

/** 카카오 회원번호의 내부 사용자 id. 이미 있으면 id를 바꾸지 않는다(DO UPDATE로 덮으면 기존 목록이 끊긴다). */
async function findOrCreateUserId(db: D1Database, kakaoId: string, now: () => Date) {
  const [, selected] = await db.batch<{ id: string }>([
    db
      .prepare(
        "INSERT INTO users (id, kakao_id, created_at) VALUES (?, ?, ?) ON CONFLICT (kakao_id) DO NOTHING",
      )
      .bind(createRandomId(), kakaoId, now().toISOString()),
    db.prepare("SELECT id FROM users WHERE kakao_id = ?").bind(kakaoId),
  ]);
  return selected.results[0].id;
}

/**
 * GET /api/auth/kakao/callback. state를 먼저 비교하고(state·초대 쿠키는 항상 지움) 취소·실패면 안내 값과 함께
 * 홈으로, 성공하면 사용자를 찾거나 만들고 세션 쿠키를 심어 홈으로 보낸다.
 * 성공이고 초대 쿠키가 있으면 초대 화면으로 보낸다. 쿠키는 클라이언트 값이라 여기서 모양을 다시 본다.
 * 초대로 시작한 로그인도 취소·실패면 홈이다(초대 토큰은 버린다).
 */
export async function finishKakaoLogin(
  request: Request,
  env: KakaoEnv,
  db: D1Database,
  deps: CallbackDeps,
): Promise<Response> {
  const url = new URL(request.url);
  const clearStateCookie = `${STATE_COOKIE}=; ${STATE_COOKIE_ATTRIBUTES}; Max-Age=0`;
  const fail = (result: LoginResult) =>
    redirectResponse(homeUrl(url.origin, result), [clearStateCookie, clearInviteCookie]);

  const state = url.searchParams.get("state");
  const savedState = readCookie(request, STATE_COOKIE);
  if (state === null || savedState === null || state !== savedState) return fail("failed");

  const error = url.searchParams.get("error");
  if (error === "access_denied") return fail("cancelled");
  const code = url.searchParams.get("code");
  if (error !== null || code === null || code === "") {
    // eslint-disable-next-line no-console
    console.error("kakao login failed", "authorize", error ?? "no code");
    return fail("failed");
  }

  const keys = readKakaoKeys(env);
  if (keys === null) return fail("failed");
  const kakaoId = await fetchKakaoUserId(deps, keys, code, callbackUrl(url.origin));
  if (kakaoId === null) return fail("failed");

  const userId = await findOrCreateUserId(db, kakaoId, deps.now);
  const sessionCookie = await createSession(db, userId, deps.now);
  const invite = readCookie(request, INVITE_COOKIE);
  const location = isInviteToken(invite) ? inviteUrl(url.origin, invite) : homeUrl(url.origin);
  return redirectResponse(location, [clearStateCookie, clearInviteCookie, sessionCookie]);
}
