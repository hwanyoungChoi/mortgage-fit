// 모든 /api/* 오류 응답의 본문. 서버(server/)도 type-only import로 이 파일을 쓴다(계약의 원본은 한 곳).

export type ApiError = {
  error:
    | "invalidParams"
    | "unauthorized"
    | "forbidden"
    | "notFound"
    | "methodNotAllowed"
    | "shareGone"
    | "payloadTooLarge"
    | "ownInvite"
    | "alreadyInHousehold"
    | "householdFull"
    | "householdLimit"
    | "inHousehold"
    | "notConfigured"
    | "quotaExceeded"
    | "rateLimited"
    | "upstream"
    | "upstreamTimeout"
    | "internal";
  message: string;
};
