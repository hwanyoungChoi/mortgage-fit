import ChevronRight from "lucide-react/icons/chevron-right";
import { useId } from "react";

import Skeleton, { SkeletonLabel } from "@/components/Skeleton";

import styles from "./HubCard.module.css";
import HubSummaryPair from "./HubSummaryPair";

import type { HubCardSummary } from "../summarizeHub";
import type { ReactNode } from "react";

type HubCardStatusKind = Exclude<HubCardSummary<unknown>["kind"], "intro" | "summary">;

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
 * 불러오는 중: 내 현황 두 줄(HubSummaryPair)과 같은 줄 상자 안에 라벨·숫자 막대를 둬 드러낼 때 카드가 움직이지 않는다.
 * 보조기기 설명은 "불러오는 중" 그대로다.
 */
function LoadingSummary() {
  return (
    <>
      <HubSummaryPair
        label={<Skeleton width="6em" height="1em" />}
        figure={
          <span>
            <Skeleton width="5em" height="1em" />
          </span>
        }
      />
      <SkeletonLabel>불러오는 중</SkeletonLabel>
    </>
  );
}

/** 상태 문구는 가리기와 상관없이 그대로 보인다. */
const STATUS_CONTENT: Record<HubCardStatusKind, ReactNode> = {
  loading: <LoadingSummary />,
  error: "불러오지 못했습니다",
  corrupt: "저장 데이터를 확인해 주세요",
};

/** 요약 줄 종류별 글자 모양. 내 현황과 불러오는 중은 두 줄 모양이다 */
const DESCRIPTION_CLASS: Record<HubCardSummary<unknown>["kind"], string> = {
  intro: styles.description,
  loading: styles.summaryLine,
  error: styles.description,
  corrupt: styles.description,
  summary: styles.summaryLine,
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
        : STATUS_CONTENT[summary.kind];
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
      {/* 누르는 카드라는 신호. 링크 이름·설명에는 들어가지 않는다 */}
      <ChevronRight className={styles.chevron} size={20} aria-hidden="true" />
      <span
        id={descriptionId}
        className={DESCRIPTION_CLASS[summary.kind]}
        aria-busy={summary.kind === "loading" || undefined}
      >
        {description}
      </span>
    </a>
  );
}

export default HubCard;
