// 카카오 로그인 REST API 중 토큰 받기·사용자 정보 두 호출(2026-10-23 공식 문서 확인분).
// 액세스 토큰은 회원번호·닉네임을 읽는 데 한 번 쓰고 버린다(저장하지 않음).

const TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const USER_URL = "https://kapi.kakao.com/v2/user/me";
const TIMEOUT_MS = 10_000;

export type KakaoKeys = { restApiKey: string; clientSecret: string };

type KakaoUserDeps = { fetch: typeof fetch };

/** `nickname`은 사용자가 닉네임 제공에 동의했을 때만 있다 */
export type KakaoUser = { kakaoId: string; nickname?: string };

/** 카카오 닉네임 길이 상한은 문서로 확인하지 못해 쿠키에 넣기 전에 자른다(쿠키 크기 한도, 홈 제목 줄 한 줄). */
const NICKNAME_MAX_LENGTH = 40;

function readNickname(kakaoAccount: unknown): string | undefined {
  if (typeof kakaoAccount !== "object" || kakaoAccount === null) return undefined;
  const { profile } = kakaoAccount as Record<string, unknown>;
  if (typeof profile !== "object" || profile === null) return undefined;
  const { nickname } = profile as Record<string, unknown>;
  if (typeof nickname !== "string") return undefined;
  const trimmed = nickname.trim().slice(0, NICKNAME_MAX_LENGTH);
  return trimmed === "" ? undefined : trimmed;
}

/** 카카오 오류 본문에서 오류 코드만 꺼낸다(토큰 API `error_code` 예: KOE237, 사용자 API `code` 예: -401). */
async function readErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    return String(body.error_code ?? body.code ?? "unknown");
  } catch {
    return "unknown";
  }
}

function logFailure(step: string, detail: string) {
  // 토큰·인가 코드·회원번호는 남기지 않는다.
  // eslint-disable-next-line no-console
  console.error("kakao login failed", step, detail);
}

/**
 * 인가 코드 → 액세스 토큰 → 회원번호(10진 문자열)와 닉네임. 어느 단계든 실패하면 null.
 * 회원번호가 안전 정수가 아니면 JSON 숫자 정밀도를 잃었을 수 있어 실패로 본다.
 */
export async function fetchKakaoUser(
  deps: KakaoUserDeps,
  keys: KakaoKeys,
  code: string,
  redirectUri: string,
): Promise<KakaoUser | null> {
  // deps.fetch(url)로 부르면 Workers에서 Illegal invocation이 날 수 있어 구조 분해해서 쓴다.
  const { fetch: fetchImpl } = deps;
  try {
    const tokenResponse = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: keys.restApiKey,
        redirect_uri: redirectUri,
        code,
        client_secret: keys.clientSecret,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!tokenResponse.ok) {
      logFailure("token", `${tokenResponse.status} ${await readErrorCode(tokenResponse)}`);
      return null;
    }
    const { access_token: accessToken } = (await tokenResponse.json()) as Record<string, unknown>;
    if (typeof accessToken !== "string" || accessToken === "") {
      logFailure("token", "no access_token");
      return null;
    }

    const userResponse = await fetchImpl(USER_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!userResponse.ok) {
      logFailure("user", `${userResponse.status} ${await readErrorCode(userResponse)}`);
      return null;
    }
    const { id, kakao_account: kakaoAccount } = (await userResponse.json()) as Record<
      string,
      unknown
    >;
    if (!Number.isSafeInteger(id)) {
      logFailure("user", "id is not a safe integer");
      return null;
    }
    const nickname = readNickname(kakaoAccount);
    return { kakaoId: String(id), ...(nickname !== undefined && { nickname }) };
  } catch (error) {
    logFailure("request", error instanceof Error ? error.name : typeof error);
    return null;
  }
}
