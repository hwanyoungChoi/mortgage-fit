import Bookmark from "lucide-react/icons/bookmark";
import Calculator from "lucide-react/icons/calculator";
import House from "lucide-react/icons/house";
import PaintRoller from "lucide-react/icons/paint-roller";

import { PATHS } from "@/lib/constants/paths";

import styles from "./TabNav.module.css";

import type { TabName } from "@/lib/types/route";
import type { LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";

type TabNavProps = {
  /** null이면 어느 탭도 선택 표시하지 않는다(공유받기·초대 화면) */
  current: TabName | null;
  /** 탭으로 화면을 바꾸기 직전에 부른다. */
  onNavigate: () => void;
};

/** 적은 순서가 화면 순서다. `Record`라 탭(TabName)을 더하고 여기 빠뜨리면 타입 검사에서 걸린다. */
const TABS: Record<TabName, { label: string; href: string; Icon: LucideIcon }> = {
  hub: { label: "홈", href: PATHS.hub, Icon: House },
  calculator: { label: "계산", href: PATHS.calculator, Icon: Calculator },
  listings: { label: "매물", href: PATHS.listings, Icon: Bookmark },
  /** 라벨은 "우리 집"(인테리어 플래너). 라벨 "홈"은 `hub`다(ADR-031 D2). */
  home: { label: "우리 집", href: PATHS.home(), Icon: PaintRoller },
};

const TAB_ORDER = Object.keys(TABS) as TabName[];

/** 새 탭에서 열기 같은 브라우저 기본 동작은 막지 않는다. */
function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * 화면 아래 고정 탭 "홈 | 계산 | 매물 | 우리 집". 아이콘과 라벨을 늘 함께 보인다.
 * 탭을 오가도 뒤로 가기 이력이 쌓이지 않게 replace로 이동한다. 현재 화면에 대한 동작([가가] 등)은 두지 않는다.
 */
function TabNav({ current, onNavigate }: TabNavProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (isModifiedClick(event)) return;
    event.preventDefault();
    onNavigate();
    window.location.replace(href);
  };

  return (
    <nav className={styles.nav} aria-label="화면">
      <ul className={styles.tabs}>
        {TAB_ORDER.map((name) => {
          const { label, href, Icon } = TABS[name];
          return (
            <li key={name} className={styles.item}>
              <a
                className={styles.tab}
                href={href}
                aria-current={name === current ? "page" : undefined}
                onClick={(event) => handleClick(event, href)}
              >
                <span className={styles.indicator}>
                  <Icon size={22} aria-hidden="true" />
                </span>
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default TabNav;
