/** 카카오 로그인에서 돌아온 결과(`#/listings?login=`). 성공은 값 없이 돌아온다. */
export type LoginResult = "cancelled" | "failed" | "notConfigured";

export type Route =
  | { name: "calculator" }
  /** `login`은 저장 목록이 한 번 잡아 안내한 뒤 주소에서 지운다. 정규화가 먼저 지우지 않도록 라우트에 둔다. */
  | { name: "listings"; login?: LoginResult }
  /** 공유받기. 토큰은 주소 그대로(대소문자 유지)이고 모양 검사는 화면이 한다. */
  | { name: "share"; token: string }
  /** 함께 쓰는 목록 초대(스펙 shared-list). 토큰은 주소 그대로(대소문자 유지)이고 모양 검사는 화면이 한다. */
  | { name: "invite"; token: string };

/** 상단 탭이 있는 화면 */
export type TabName = Exclude<Route["name"], "share" | "invite">;
