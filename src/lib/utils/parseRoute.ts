import { PATHS } from "@/lib/constants/paths";

import { isOneOf } from "./isOneOf";
import { isInteriorPlanId } from "./validateInteriorPlan";
import { isListingId } from "./validateListingFields";

import type { HomeView, LoginResult, Route } from "@/lib/types/route";

const LOGIN_RESULTS: LoginResult[] = ["cancelled", "failed", "notConfigured"];

/** 주소에 남는 보기. 공간별은 기본값이라 쓰지 않는다 */
const HOME_VIEW_QUERY_VALUES: Exclude<HomeView, "space">[] = ["trade", "table"];

const CALCULATOR_PATH = "/calculator";
const HOME_PATH = "/home";
const SHARE_PATH_PREFIX = "/share/";
const INVITE_PATH_PREFIX = "/invite/";

/**
 * 해시 → 라우트. 알 수 없는 해시는 홈(허브)이다. 계산은 경로가 정확히 `/calculator`일 때만이고 쿼리는 버린다.
 * 홈도 쿼리를 버린다(옛 `#/?login=` 등은 정규 경로 `#/`로 바뀐다).
 * 목록의 쿼리는 로그인 결과(`login`)만 읽고 허용 목록 밖의 값이면 버린다. 그 밖의 쿼리(옛 `sort`·`order`·`view`)는 버려
 * 정규 경로 `#/listings`로 바뀐다.
 * `/share/`·`/invite/` 뒤는 모양이 틀려도 그 라우트로 둔다. 화면이 "끊긴 링크"로 안내한다(홈으로 돌리지 않는다).
 * 우리 집은 형식이 틀린 플랜 id·매물 id를 버리고(`#/home`), `view`는 `trade`·`table`만 남긴다(그 밖은 공간별).
 */
export function parseRoute(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#/, "").split("?", 2);
  if (path.startsWith(SHARE_PATH_PREFIX)) {
    return { name: "share", token: path.slice(SHARE_PATH_PREFIX.length) };
  }
  if (path.startsWith(INVITE_PATH_PREFIX)) {
    return { name: "invite", token: path.slice(INVITE_PATH_PREFIX.length) };
  }
  if (path === "/listings") {
    const login = new URLSearchParams(query).get("login");
    return { name: "listings", ...(isOneOf(LOGIN_RESULTS, login) && { login }) };
  }
  if (path === HOME_PATH || path.startsWith(`${HOME_PATH}/`)) return parseHomeRoute(path, query);
  if (path === CALCULATOR_PATH) return { name: "calculator" };
  return { name: "hub" };
}

function parseHomeRoute(path: string, query: string): Route {
  const planId = path.slice(HOME_PATH.length + 1);
  const params = new URLSearchParams(query);
  const listingId = params.get("listing");
  const view = params.get("view");
  return {
    name: "home",
    ...(isInteriorPlanId(planId) && { planId }),
    ...(isListingId(listingId) && { listingId }),
    ...(isOneOf(HOME_VIEW_QUERY_VALUES, view) && { view }),
  };
}

/** 라우트의 정규 경로. 주소가 이것과 다르면 `useHashRoute`가 이 경로로 replace한다. */
export function toRoutePath(route: Route): string {
  if (route.name === "share") return PATHS.share(route.token);
  if (route.name === "invite") return PATHS.invite(route.token);
  if (route.name === "home") return PATHS.home(route);
  if (route.name === "listings") return PATHS.listings(route);
  return route.name === "calculator" ? PATHS.calculator : PATHS.hub;
}
