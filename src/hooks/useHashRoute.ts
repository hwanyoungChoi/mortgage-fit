import { useEffect, useSyncExternalStore } from "react";

import { parseRoute, toRoutePath } from "@/lib/utils/parseRoute";

import type { Route } from "@/lib/types/route";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getHash() {
  return window.location.hash;
}

/** 현재 해시 라우트. 주소가 정규 경로가 아니면(알 수 없는 해시 등) 정규 경로로 replace한다. */
export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash);
  const route = parseRoute(hash);
  const canonicalPath = toRoutePath(route);

  // 화면이 그사이 주소를 이미 바꿨으면(홈이 `?login=`을 지움) 옛 해시 기준으로 되돌리지 않는다.
  useEffect(() => {
    if (window.location.hash === hash && hash !== canonicalPath)
      window.location.replace(canonicalPath);
  }, [hash, canonicalPath]);

  return route;
}
