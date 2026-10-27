import { useLayoutEffect } from "react";

/** 마지막으로 목록을 떠날 때의 스크롤 위치. 새로고침하면 사라진다(ADR-004). */
let savedScrollY = 0;

/** 탭·홈 카드로 들어오는 목록은 맨 위에서 시작한다. 탭이나 [매물 모으기] 카드를 누를 때 부른다. */
export function resetListingsScroll() {
  savedScrollY = 0;
}

/**
 * 목록 스크롤을 언마운트 때 저장하고 마운트 때 복원한다(카드 → 계산 → 뒤로 가기).
 * layout effect여야 한다. 정리 함수가 목록 DOM이 빠지기 전에 돌아서, 다음 화면 높이에 잘리지 않은 값을 읽는다.
 */
export function useListingsScrollRestoration() {
  useLayoutEffect(() => {
    window.scrollTo(0, savedScrollY);
    return () => {
      savedScrollY = window.scrollY;
    };
  }, []);
}
