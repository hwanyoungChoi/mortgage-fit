import styles from "./StatusPanel.module.css";

import type { ReactNode } from "react";

type StatusPanelProps = {
  title: string;
  description?: string;
  /** 다음 동작(링크·버튼) */
  children?: ReactNode;
};

/** 링크로 여는 화면(공유받기·함께 쓰기 초대)의 로딩·사라진 링크·오류 안내. 상태가 바뀌어도 같은 자리에 같은 모양으로 앉는다. */
function StatusPanel({ title, description, children }: StatusPanelProps) {
  return (
    <section className={styles.panel}>
      <h1 className={styles.title}>{title}</h1>
      {description !== undefined && <p className={styles.description}>{description}</p>}
      {children}
    </section>
  );
}

export default StatusPanel;
