import type { ApiError } from "@/lib/types/api";

type QueryParams = Record<string, string | number | undefined>;

/** 서버가 보내는 오류 코드 전부. 등록이 빠지면 타입 검사에서 걸린다. */
const API_ERROR_CODES: Record<ApiError["error"], true> = {
  invalidParams: true,
  unauthorized: true,
  forbidden: true,
  notFound: true,
  methodNotAllowed: true,
  shareGone: true,
  payloadTooLarge: true,
  ownInvite: true,
  alreadyInHousehold: true,
  householdFull: true,
  householdLimit: true,
  inHousehold: true,
  notConfigured: true,
  quotaExceeded: true,
  rateLimited: true,
  upstream: true,
  upstreamTimeout: true,
  internal: true,
};

/** 2xx가 아닌 응답. 본문이 `ApiError`가 아니면(HTML 등) `body`는 null이고 알 수 없는 오류로 본다. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiError | null;

  constructor(status: number, body: ApiError | null) {
    super(body === null ? `HTTP ${status}` : `${body.error}: ${body.message}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) return false;
  const { error, message } = value as Record<string, unknown>;
  return (
    typeof error === "string" &&
    Object.hasOwn(API_ERROR_CODES, error) &&
    typeof message === "string"
  );
}

async function readApiError(response: Response): Promise<ApiError | null> {
  try {
    const body: unknown = await response.json();
    return isApiError(body) ? body : null;
  } catch {
    return null;
  }
}

function toSearch(params: QueryParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const search = query.toString();
  return search === "" ? "" : `?${search}`;
}

type RequestOptions = {
  params?: QueryParams;
  /** JSON으로 보낸다. */
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * 같은 출처의 `/api/*`를 부르는 fetch 래퍼(ADR-014). 값이 undefined인 파라미터는 보내지 않는다.
 * 204는 본문이 없으므로 파싱하지 않는다(공유 끊기·매물 삭제·로그아웃).
 */
async function request<T>(
  method: string,
  path: string,
  { params = {}, body, headers = {} }: RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${path}${toSearch(params)}`, {
    method,
    headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new ApiRequestError(response.status, await readApiError(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string, options?: Pick<RequestOptions, "params">) =>
    request<T>("GET", path, options),
  /** 본문 없는 POST(로그아웃)는 `body`를 넘기지 않는다. */
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, { body }),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, { body }),
  delete: (path: string, options?: Pick<RequestOptions, "headers">) =>
    request<void>("DELETE", path, options),
};
