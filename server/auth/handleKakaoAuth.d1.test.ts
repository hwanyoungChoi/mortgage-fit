// 카카오 로그인 성공 경로 특성 테스트(스펙 hub-account AC-2 be). 사용자·세션 행을 만들므로 D1에서 돈다.
// 실패·취소 경로는 handleKakaoAuth.test.ts. 가짜 fetch·쿠키 파싱은 이 파일 안에 둔다(harness.ts 무변경).
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { finishKakaoLogin } from "./handleKakaoAuth";
import { callApi, clearTables, countRows, migrate, newInviteToken, ORIGIN } from "../test/harness";

const db = env.DB;
const KEYS = { KAKAO_REST_API_KEY: "rest-key", KAKAO_CLIENT_SECRET: "client-secret" };
const STATE = "saved-state-value";
const KAKAO_ID = 1234567890;
/** 실제 시계 기준(세션 쿠키로 /api/me를 부르면 Worker는 실제 시각으로 만료를 본다) */
const NOW = new Date();

const CLEAR_STATE_COOKIE =
  "mf_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/kakao; Max-Age=0";
const CLEAR_INVITE_COOKIE =
  "mf_oauth_invite=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/kakao; Max-Age=0";
/** `mf_session={id 22자}.{secret 43자}`, 30일 */
const SESSION_COOKIE_PATTERN =
  /^mf_session=([A-Za-z0-9_-]{22})\.[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=2592000$/;

/** 토큰 API → 사용자 API 모두 성공 */
const fetchOk = () =>
  vi.fn<typeof fetch>(async (input) =>
    String(input).startsWith("https://kauth.kakao.com/oauth/token")
      ? Response.json({ access_token: "access-token" })
      : Response.json({ id: KAKAO_ID }),
  );

function callbackRequest(cookies: Record<string, string>, origin = ORIGIN): Request {
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new Request(`${origin}/api/auth/kakao/callback?state=${STATE}&code=auth-code`, {
    headers: { Cookie: cookieHeader },
  });
}

const finish = (request: Request) =>
  finishKakaoLogin(request, KEYS, db, { fetch: fetchOk(), now: () => NOW });

/** 302·no-store·Location과 Set-Cookie 셋(state 삭제, 초대 삭제, 세션). 세션 쿠키는 모양으로 본다. */
async function expectSuccessRedirect(response: Response, location: string) {
  const cookies = response.headers.getSetCookie();
  expect({
    status: response.status,
    cacheControl: response.headers.get("Cache-Control"),
    location: response.headers.get("Location"),
    cookieCount: cookies.length,
    clearCookies: cookies.slice(0, 2),
  }).toEqual({
    status: 302,
    cacheControl: "no-store",
    location,
    cookieCount: 3,
    clearCookies: [CLEAR_STATE_COOKIE, CLEAR_INVITE_COOKIE],
  });
  expect(cookies[2]).toMatch(SESSION_COOKIE_PATTERN);
  return cookies[2].split(";")[0];
}

beforeAll(async () => {
  await migrate(db);
});

beforeEach(async () => {
  await clearTables(db);
});

describe("finishKakaoLogin 성공", () => {
  it("초대 쿠키 없음(보통 로그인·공유받기 화면에서 시작한 로그인) → 저장 목록, 사용자·세션 행 생성", async () => {
    const sessionCookie = await expectSuccessRedirect(
      await finish(callbackRequest({ mf_oauth_state: STATE })),
      `${ORIGIN}/#/listings`,
    );

    const user = await db
      .prepare("SELECT id, created_at FROM users WHERE kakao_id = ?")
      .bind(String(KAKAO_ID))
      .first<{ id: string; created_at: string }>();
    expect(user?.created_at).toBe(NOW.toISOString());
    expect(await countRows(db, "users")).toBe(1);
    expect(await countRows(db, "sessions WHERE user_id = ?", user?.id)).toBe(1);
    // 심은 세션 쿠키로 로그인이 된다
    const me = await callApi(db, "GET", "/api/me", { cookie: sessionCookie });
    expect(((await me.json()) as { user: { id: string } | null }).user?.id).toBe(user?.id);
  });

  it("이미 있는 카카오 회원번호면 사용자 id를 바꾸지 않고 세션만 더한다", async () => {
    await finish(callbackRequest({ mf_oauth_state: STATE }));
    const first = await db.prepare("SELECT id FROM users").first<{ id: string }>();

    await expectSuccessRedirect(
      await finish(callbackRequest({ mf_oauth_state: STATE })),
      `${ORIGIN}/#/listings`,
    );

    const ids = await db.prepare("SELECT id FROM users").all<{ id: string }>();
    expect(ids.results).toEqual([{ id: first?.id }]);
    expect(await countRows(db, "sessions WHERE user_id = ?", first?.id)).toBe(2);
  });

  it("정상 초대 쿠키 → 초대 화면", async () => {
    const token = newInviteToken();

    await expectSuccessRedirect(
      await finish(callbackRequest({ mf_oauth_state: STATE, mf_oauth_invite: token })),
      `${ORIGIN}/#/invite/${token}`,
    );
  });

  it("모양이 틀린 초대 쿠키 → 초대 화면이 아니라 저장 목록", async () => {
    await expectSuccessRedirect(
      await finish(callbackRequest({ mf_oauth_state: STATE, mf_oauth_invite: "not-a-token" })),
      `${ORIGIN}/#/listings`,
    );
  });

  it("포트 있는 origin도 그 origin으로 보낸다", async () => {
    await expectSuccessRedirect(
      await finish(callbackRequest({ mf_oauth_state: STATE }, "http://localhost:8788")),
      "http://localhost:8788/#/listings",
    );
  });
});
