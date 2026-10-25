import type { Route } from "@/lib/types/route";

type ListingsPathParams = Omit<Extract<Route, { name: "listings" }>, "name">;

export const PATHS = {
  calculator: "#/",
  /** `login`은 로그인에서 돌아온 결과(서버가 붙인다). 인자가 없으면 `#/listings`. */
  listings: ({ login }: ListingsPathParams = {}) =>
    login === undefined ? "#/listings" : `#/listings?login=${login}`,
  /** 토큰은 받은 그대로 둔다(대소문자 구분). */
  share: (token: string) => `#/share/${token}`,
  /** 함께 쓰는 목록 초대. 토큰은 받은 그대로 둔다(대소문자 구분). */
  invite: (token: string) => `#/invite/${token}`,
  /** 카카오 로그인 시작. 해시 라우트가 아니라 Worker 경로라 페이지 전체가 이동한다. */
  kakaoLogin: "/api/auth/kakao/login",
  /** 초대를 들고 로그인 시작. 로그인에 성공하면 서버가 `#/invite/{token}`으로 돌려보낸다(ADR-028 D3). */
  kakaoInviteLogin: (token: string) => `/api/auth/kakao/login?invite=${encodeURIComponent(token)}`,
};
