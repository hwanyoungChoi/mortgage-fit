/** 카카오 로그인에서 돌아온 결과(`#/listings?login=`). 성공은 값 없이 돌아온다. */
export type LoginResult = "cancelled" | "failed" | "notConfigured";

/** [우리 집] 플랜 화면의 보기: 공간별·공종별 목록과 표(태스크 5, ADR-030). 주소에 없으면 공간별이다. */
export type HomeView = "space" | "trade" | "table";

/** 항목 목록으로 보이는 보기(공간별·공종별). 표 보기는 목록을 그리지 않는다 */
export type ListView = Exclude<HomeView, "table">;

export type Route =
  /** 홈(허브, 첫 화면 `#/`). 화면 라벨은 "홈"이다. 라벨 "우리 집"은 아래 `home`(인테리어 플래너)이다(ADR-031 D2). */
  | { name: "hub" }
  | { name: "calculator" }
  /** `login`은 저장 목록이 한 번 잡아 안내한 뒤 주소에서 지운다. 정규화가 먼저 지우지 않도록 라우트에 둔다. */
  | { name: "listings"; login?: LoginResult }
  /** 공유받기. 토큰은 주소 그대로(대소문자 유지)이고 모양 검사는 화면이 한다. */
  | { name: "share"; token: string }
  /** 함께 쓰는 목록 초대(스펙 shared-list). 토큰은 주소 그대로(대소문자 유지)이고 모양 검사는 화면이 한다. */
  | { name: "invite"; token: string }
  /**
   * 우리 집(인테리어 플래너, 스펙 interior-planner). `planId`가 없으면 플랜 수로 화면을 고른다(0개 빈 상태 · 1개 그 플랜 · 2~3개 고르기).
   * `listingId`는 매물 카드에서 들어온 길(`?listing=`), `view`는 보기(`?view=trade`·`?view=table`, 없으면 공간별).
   */
  | { name: "home"; planId?: string; listingId?: string; view?: HomeView };

/** 하단 탭이 있는 화면 */
export type TabName = Exclude<Route["name"], "share" | "invite">;
