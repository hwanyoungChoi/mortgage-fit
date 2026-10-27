// 카카오 로그인 리다이렉트 특성 테스트(스펙 hub-account AC-2 be). DB 앞에서 끝나는 경로만 여기서 본다(DB는 닿으면 던지는 대역).
// node 프로젝트(tsconfig.server-test.json, node 타입만)에서는 handleKakaoAuth.ts의 D1 타입을 못 읽어 workerd에서 돌린다.
// DB를 쓰는 성공 경로는 handleKakaoAuth.d1.test.ts. 도우미는 이 파일 안에 둔다(server/test/harness.ts 무변경).
import { afterEach, describe, expect, it, vi } from "vitest";

import { finishKakaoLogin, startKakaoLogin } from "./handleKakaoAuth";

const ORIGIN = "https://loan.conychoi.dev";
type KakaoEnv = { KAKAO_REST_API_KEY?: string; KAKAO_CLIENT_SECRET?: string };

const KEYS: KakaoEnv = { KAKAO_REST_API_KEY: "rest-key", KAKAO_CLIENT_SECRET: "client-secret" };
const STATE = "saved-state-value";
const CODE = "authorization-code-secret";
const ACCESS_TOKEN = "access-token-secret";
/** 16바이트 base64url 22자(초대 토큰 모양) */
const INVITE_TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

const CLEAR_STATE_COOKIE =
  "mf_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/kakao; Max-Age=0";
const CLEAR_INVITE_COOKIE =
  "mf_oauth_invite=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/kakao; Max-Age=0";

/** 이 경로들은 DB 앞에서 끝나야 한다. 건드리면 테스트가 실패한다. */
const UNTOUCHABLE_DB = new Proxy({} as D1Database, {
  get(_target, property) {
    throw new Error(`DB에 닿으면 안 된다: ${String(property)}`);
  },
});

const NOW = () => new Date("2026-10-27T00:00:00Z");

type Reply = { status: number; body: unknown };

/** 토큰 API·사용자 API 순서로 응답한다. 호출 기록은 mock.calls로 본다. */
function fakeFetch(token: Reply, user: Reply = { status: 200, body: { id: 1234567890 } }) {
  return vi.fn<typeof fetch>(async (input) =>
    String(input).startsWith("https://kauth.kakao.com/oauth/token")
      ? Response.json(token.body, { status: token.status })
      : Response.json(user.body, { status: user.status }),
  );
}

const NO_FETCH = vi.fn<typeof fetch>(async () => {
  throw new Error("카카오 API를 부르면 안 된다");
});

function callbackRequest(
  params: Record<string, string>,
  cookies: Record<string, string> = {},
  origin = ORIGIN,
): Request {
  const query = new URLSearchParams(params);
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new Request(`${origin}/api/auth/kakao/callback?${query}`, {
    headers: cookieHeader === "" ? {} : { Cookie: cookieHeader },
  });
}

/** 응답의 리다이렉트 모양을 한 객체로(302·no-store·Location·Set-Cookie 순서 그대로) */
const redirectOf = (response: Response) => ({
  status: response.status,
  cacheControl: response.headers.get("Cache-Control"),
  location: response.headers.get("Location"),
  cookies: response.headers.getSetCookie(),
});

const failedRedirect = (location: string) => ({
  status: 302,
  cacheControl: "no-store",
  location,
  cookies: [CLEAR_STATE_COOKIE, CLEAR_INVITE_COOKIE],
});

/** console.error 인자 전체를 한 문자열로(토큰·코드가 새지 않았는지 볼 때) */
const loggedText = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((args) => args.map(String).join(" ")).join("\n");

afterEach(() => {
  vi.restoreAllMocks();
  NO_FETCH.mockClear();
});

describe("startKakaoLogin: 키가 없으면 notConfigured", () => {
  it.each([
    ["키 둘 다 없음", {}],
    ["REST 키만 비어 있음", { ...KEYS, KAKAO_REST_API_KEY: "" }],
    ["시크릿만 비어 있음", { ...KEYS, KAKAO_CLIENT_SECRET: "" }],
    ["공백만", { KAKAO_REST_API_KEY: "  ", KAKAO_CLIENT_SECRET: "\t" }],
  ])("%s → 홈 ?login=notConfigured, 초대 쿠키만 지운다", (_name, env) => {
    const response = startKakaoLogin(new Request(`${ORIGIN}/api/auth/kakao/login`), env);

    expect(redirectOf(response)).toEqual({
      status: 302,
      cacheControl: "no-store",
      location: `${ORIGIN}/#/?login=notConfigured`,
      cookies: [CLEAR_INVITE_COOKIE],
    });
  });

  it("포트 있는 origin도 그 origin으로 보낸다", () => {
    const response = startKakaoLogin(new Request("http://localhost:8788/api/auth/kakao/login"), {});

    expect(response.headers.get("Location")).toBe("http://localhost:8788/#/?login=notConfigured");
  });
});

describe("startKakaoLogin: 키가 있으면 카카오 인가 화면", () => {
  const stateCookieOf = (cookies: string[]) => {
    const match = /^mf_oauth_state=([A-Za-z0-9_-]{43}); (.+)$/.exec(cookies[0]);
    return { value: match?.[1], attributes: match?.[2] };
  };

  it("state 쿠키(600초)를 심고 남은 초대 쿠키는 지운다", () => {
    const response = startKakaoLogin(new Request(`${ORIGIN}/api/auth/kakao/login`), KEYS);
    const { status, cacheControl, location, cookies } = redirectOf(response);
    const stateCookie = stateCookieOf(cookies);
    const authorize = new URL(location ?? "");

    expect({ status, cacheControl }).toEqual({ status: 302, cacheControl: "no-store" });
    expect(`${authorize.origin}${authorize.pathname}`).toBe(
      "https://kauth.kakao.com/oauth/authorize",
    );
    expect(Object.fromEntries(authorize.searchParams)).toEqual({
      client_id: "rest-key",
      redirect_uri: `${ORIGIN}/api/auth/kakao/callback`,
      response_type: "code",
      state: stateCookie.value,
    });
    expect(cookies).toHaveLength(2);
    expect(stateCookie.attributes).toBe(
      "HttpOnly; Secure; SameSite=Lax; Path=/api/auth/kakao; Max-Age=600",
    );
    expect(cookies[1]).toBe(CLEAR_INVITE_COOKIE);
  });

  it("모양이 맞는 ?invite=는 초대 쿠키(600초)로 심는다", () => {
    const response = startKakaoLogin(
      new Request(`${ORIGIN}/api/auth/kakao/login?invite=${INVITE_TOKEN}`),
      KEYS,
    );

    expect(response.headers.getSetCookie()[1]).toBe(
      `mf_oauth_invite=${INVITE_TOKEN}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/kakao; Max-Age=600`,
    );
  });

  it("모양이 틀린 ?invite=는 심지 않고 초대 쿠키를 지운다", () => {
    const response = startKakaoLogin(
      new Request(`${ORIGIN}/api/auth/kakao/login?invite=too-short`),
      KEYS,
    );

    expect(response.headers.getSetCookie()[1]).toBe(CLEAR_INVITE_COOKIE);
  });

  it("포트 있는 origin은 Redirect URI에 그대로 들어간다", () => {
    const response = startKakaoLogin(
      new Request("http://localhost:8788/api/auth/kakao/login"),
      KEYS,
    );
    const authorize = new URL(response.headers.get("Location") ?? "");

    expect(authorize.searchParams.get("redirect_uri")).toBe(
      "http://localhost:8788/api/auth/kakao/callback",
    );
  });
});

describe("finishKakaoLogin: DB 앞에서 끝나는 실패·취소", () => {
  const finish = (request: Request, env = KEYS, fetchImpl: typeof fetch = NO_FETCH) =>
    finishKakaoLogin(request, env, UNTOUCHABLE_DB, { fetch: fetchImpl, now: NOW });

  it.each([
    ["state 쿠키 없음", { state: STATE, code: CODE }, {}],
    ["state 쿼리 없음", { code: CODE }, { mf_oauth_state: STATE }],
    ["state 불일치", { state: "other-state", code: CODE }, { mf_oauth_state: STATE }],
    [
      "state 불일치 + error=access_denied(state를 먼저 본다)",
      { state: "other-state", error: "access_denied" },
      { mf_oauth_state: STATE },
    ],
  ])("%s → failed", async (_name, params, cookies) => {
    const response = await finish(callbackRequest(params, cookies));

    expect(redirectOf(response)).toEqual(failedRedirect(`${ORIGIN}/#/?login=failed`));
    expect(NO_FETCH).not.toHaveBeenCalled();
  });

  it("error=access_denied → cancelled(로그를 남기지 않는다)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await finish(
      callbackRequest({ state: STATE, error: "access_denied" }, { mf_oauth_state: STATE }),
    );

    expect(redirectOf(response)).toEqual(failedRedirect(`${ORIGIN}/#/?login=cancelled`));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it.each([
    ["error=server_error", { state: STATE, error: "server_error", code: CODE }, "server_error"],
    ["code 없음", { state: STATE }, "no code"],
    ["code 빈 문자열", { state: STATE, code: "" }, "no code"],
  ])("%s → failed, 인가 단계 로그(코드 없음)", async (_name, params, detail) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await finish(callbackRequest(params, { mf_oauth_state: STATE }));

    expect(redirectOf(response)).toEqual(failedRedirect(`${ORIGIN}/#/?login=failed`));
    expect(consoleError.mock.calls).toEqual([["kakao login failed", "authorize", detail]]);
    expect(loggedText(consoleError)).not.toContain(CODE);
    expect(NO_FETCH).not.toHaveBeenCalled();
  });

  it.each([
    ["시크릿 비어 있음", { ...KEYS, KAKAO_CLIENT_SECRET: " " }],
    ["키 둘 다 없음", {}],
  ])("콜백에서 %s → failed, 카카오를 부르지 않는다", async (_name, env) => {
    const response = await finish(
      callbackRequest({ state: STATE, code: CODE }, { mf_oauth_state: STATE }),
      env,
    );

    expect(redirectOf(response)).toEqual(failedRedirect(`${ORIGIN}/#/?login=failed`));
    expect(NO_FETCH).not.toHaveBeenCalled();
  });

  it("토큰 교환 실패 → failed, 로그에 코드·시크릿이 없다", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = fakeFetch({ status: 401, body: { error_code: "KOE320" } });

    const response = await finish(
      callbackRequest({ state: STATE, code: CODE }, { mf_oauth_state: STATE }),
      KEYS,
      fetchImpl,
    );

    expect(redirectOf(response)).toEqual(failedRedirect(`${ORIGIN}/#/?login=failed`));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls).toEqual([["kakao login failed", "token", "401 KOE320"]]);
    expect(loggedText(consoleError)).not.toContain(CODE);
    expect(loggedText(consoleError)).not.toContain("client-secret");
  });

  it("사용자 정보 실패 → failed, 로그에 액세스 토큰이 없다", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = fakeFetch(
      { status: 200, body: { access_token: ACCESS_TOKEN } },
      { status: 401, body: { code: -401 } },
    );

    const response = await finish(
      callbackRequest({ state: STATE, code: CODE }, { mf_oauth_state: STATE }),
      KEYS,
      fetchImpl,
    );

    expect(redirectOf(response)).toEqual(failedRedirect(`${ORIGIN}/#/?login=failed`));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(consoleError.mock.calls).toEqual([["kakao login failed", "user", "401 -401"]]);
    expect(loggedText(consoleError)).not.toContain(ACCESS_TOKEN);
    expect(loggedText(consoleError)).not.toContain(CODE);
  });

  it.each([
    ["취소", "cancelled", { state: STATE, error: "access_denied" }],
    ["state 불일치", "failed", { state: "other-state", code: CODE }],
    ["code 없음", "failed", { state: STATE }],
  ])(
    "초대로 시작한 로그인의 %s → 초대 화면이 아니라 홈 ?login=%s, 초대 쿠키를 지운다",
    async (_name, result, params) => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await finish(
        callbackRequest(params, { mf_oauth_state: STATE, mf_oauth_invite: INVITE_TOKEN }),
      );

      expect(redirectOf(response)).toEqual(failedRedirect(`${ORIGIN}/#/?login=${result}`));
    },
  );

  it("포트 있는 origin도 그 origin으로 보낸다", async () => {
    const response = await finish(
      callbackRequest(
        { state: STATE, error: "access_denied" },
        { mf_oauth_state: STATE },
        "http://localhost:8788",
      ),
    );

    expect(response.headers.get("Location")).toBe("http://localhost:8788/#/?login=cancelled");
  });
});
