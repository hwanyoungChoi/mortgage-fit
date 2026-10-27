import { useId } from "react";

import styles from "./HubCard.module.css";

import type { HubCardSummary } from "../summarizeHub";
import type { ReactNode } from "react";

type HubCardStatusKind = Exclude<HubCardSummary<unknown>["kind"], "intro" | "summary">;

/** 상태 문구는 가리기와 상관없이 그대로 보인다. */
const STATUS_TEXT: Record<HubCardStatusKind, string> = {
  loading: "불러오는 중",
  error: "불러오지 못했습니다",
  corrupt: "저장 데이터를 확인해 주세요",
};

type HubCardProps<T> = {
  title: string;
  href: string;
  /** 보일 내 현황이 없을 때의 소개 문구 */
  intro: string;
  summary: HubCardSummary<T>;
  renderSummary: (value: T) => ReactNode;
  /** 홈에서 가장 크게 보이는 카드(대출 계산) */
  isPrimary?: boolean;
  /** 이동 직전에 부른다. 일반 링크라 이동은 push(뒤로 가기로 홈에 돌아온다). */
  onClick?: () => void;
};

/**
 * 카드 전체가 하나의 링크다(누르는 자리를 넓게). 링크 이름은 제목만이고, 요약 줄(소개·내 현황·상태 문구)은
 * 설명(aria-describedby)으로 읽힌다. 어떤 상태에서도 링크는 동작한다. 번호·단계·잠금 표시는 두지 않는다.
 */
function HubCard<T>({
  title,
  href,
  intro,
  summary,
  renderSummary,
  isPrimary = false,
  onClick,
}: HubCardProps<T>) {
  const titleId = useId();
  const descriptionId = useId();
  const description =
    summary.kind === "summary"
      ? renderSummary(summary.value)
      : summary.kind === "intro"
        ? intro
        : STATUS_TEXT[summary.kind];
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
      <span
        id={descriptionId}
        className={styles.description}
        aria-busy={summary.kind === "loading" || undefined}
      >
        {description}
      </span>
    </a>
  );
}

export default HubCard;
