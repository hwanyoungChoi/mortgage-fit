// /api/household* 계약(스펙 shared-list, ADR-028). 서버(server/)도 type-only import로 이 파일을 쓴다(계약의 원본은 한 곳).

/** 함께 쓰는 목록(가구) 요약. 상대가 누구인지는 내려주지 않는다(인원만). */
export type Household = { memberCount: number };

/** POST /api/household/invites → 201. 토큰 평문은 이 응답에서만 받을 수 있다(서버는 해시만 저장). */
export type CreateHouseholdInviteResponse = {
  token: string;
  /** `{origin}/#/invite/{token}` */
  url: string;
  /** ISO 8601, 만든 시각 + 7일 */
  expiresAt: string;
};

/** GET /api/household/invites/{token} → 200. 없음·끊김·사용됨·만료는 모두 404 notFound */
export type HouseholdInviteResponse = {
  /** ISO 8601 */
  expiresAt: string;
};

/** POST /api/household/invites/{token}/accept → 200 */
export type AcceptHouseholdInviteResponse = { household: Household };
