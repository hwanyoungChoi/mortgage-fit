import ChevronDown from "lucide-react/icons/chevron-down";

import styles from "./PlanLines.module.css";

import type { InteriorPlanRowGroup } from "@/lib/utils/interiorPlanRows";

/**
 * 묶음 제목 글자: 구분 + (접혔을 때만) "· n줄" + 꺾쇠(펼침 ∨, 접힘 >).
 * 목록의 제목 버튼 안과 끄는 동안 뜬 묶음(버튼 없음)이 같이 쓴다.
 */
function GroupTitle({ group, isCollapsed }: { group: InteriorPlanRowGroup; isCollapsed: boolean }) {
  return (
    <>
      {group.trade}
      {/* 띄어쓰기는 span 밖에 둔다(접근 가능한 이름이 "도배 · 2줄"로 읽히게) */}
      {isCollapsed && (
        <>
          {" "}
          <span className={styles.groupLineCount}>· {group.rows.length}줄</span>
        </>
      )}
      <ChevronDown
        size={18}
        aria-hidden="true"
        className={isCollapsed ? styles.groupChevronCollapsed : styles.groupChevron}
      />
    </>
  );
}

export default GroupTitle;
