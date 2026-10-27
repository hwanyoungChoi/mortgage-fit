import { useId } from "react";

import styles from "./HubCard.module.css";

type HubCardProps = {
  title: string;
  href: string;
  /** 카드 소개 문구. 링크 이름은 제목만이고 이 문구는 설명(aria-describedby)으로 읽힌다. */
  description: string;
  /** 홈에서 가장 크게 보이는 카드(대출 계산) */
  isPrimary?: boolean;
  /** 이동 직전에 부른다. 일반 링크라 이동은 push(뒤로 가기로 홈에 돌아온다). */
  onClick?: () => void;
};

/** 카드 전체가 하나의 링크다(누르는 자리를 넓게). 번호·단계·잠금 표시는 두지 않는다. */
function HubCard({ title, href, description, isPrimary = false, onClick }: HubCardProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <a
      className={isPrimary ? styles.primaryCard : styles.card}
      href={href}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={onClick}
    >
      <span id={titleId} className={styles.title}>
        {title}
      </span>
      <span id={descriptionId} className={styles.description}>
        {description}
      </span>
    </a>
  );
}

export default HubCard;
