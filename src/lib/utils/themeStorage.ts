import { DEFAULT_THEME, THEMES } from "@/lib/constants/theme";

import { isOneOf } from "./isOneOf";

import type { Theme, ThemeStore } from "@/lib/types/theme";

/** 새 키. 원문은 따옴표 없는 값 그대로 */
export const THEME_STORAGE_KEY = "loan-calculator/theme";

/** 키 없음·모르는 값·접근 불가는 기기 설정을 따른다. */
export function loadTheme(storage: Storage): Theme {
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY);
    return isOneOf(THEMES, raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** `<html data-theme>`. index.css가 이 값으로 `color-scheme`을 정하고, 색 토큰(`light-dark()`)이 그에 맞는 값을 고른다. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/**
 * 메모리 상태가 원본이고 storage에는 최선으로 기록한다(접근 불가면 이 탭에서만 유지). 고를 때만 쓴다.
 * 첫 화면은 main.tsx가 렌더 전에 같은 값을 `<html>`에 적용한다(깜박임 방지). 글자 크기 저장소와 같은 모양이다.
 */
export function createThemeStore({ storage }: { storage: Storage }): ThemeStore {
  const listeners = new Set<() => void>();
  let theme = loadTheme(storage);

  return {
    getSnapshot: () => theme,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next) {
      theme = next;
      applyTheme(next);
      try {
        storage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // 접근 불가·용량 초과: 이 탭에서만 유지한다.
      }
      for (const listener of listeners) listener();
    },
  };
}
