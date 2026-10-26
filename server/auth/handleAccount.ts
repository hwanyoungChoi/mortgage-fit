import { deleteSession, expiredSessionCookie, withOptionalSession } from "./session";
import { readHousehold } from "../household/householdScope";
import { jsonResponse, noContentResponse } from "../http/response";

import type { MeResponse } from "../../src/lib/types/account";

/** POST /api/auth/logout. 우리 세션만 지운다(카카오 로그아웃 API는 부르지 않음). 쿠키가 없어도 204 */
export async function logout(request: Request, db: D1Database): Promise<Response> {
  await deleteSession(request, db);
  const response = noContentResponse();
  response.headers.append("Set-Cookie", expiredSessionCookie());
  return response;
}

/** GET /api/me. 로그인 안 했으면 401 대신 200 `{ user: null }`. 혼자 쓰면 `household: null` */
export function getMe(request: Request, db: D1Database, now: () => Date): Promise<Response> {
  return withOptionalSession(request, db, now, async (userId) => {
    const body: MeResponse = {
      user: userId === null ? null : { id: userId, household: await readHousehold(db, userId) },
    };
    return jsonResponse(200, body, { "Cache-Control": "no-store" });
  });
}
