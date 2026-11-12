import { useState } from "react";

import Skeleton from "@/components/Skeleton";

import { canRetryTradesError, describeTradesError } from "../describeTradesError";
import styles from "./TradeResults.module.css";
import TradeRow from "./TradeRow";

import type { AptTradesResponse } from "@/lib/types/aptTrade";

type TradeResultsProps = {
  status: "pending" | "error" | "success";
  data: AptTradesResponse | undefined;
  error: unknown;
  onRetry: () => void;
};

/** 응답은 전량이 오고 화면이 이만큼씩 보여 준다. */
export const TRADES_PAGE_SIZE = 50;

const SKELETON_ROWS = [0, 1, 2];

/** 조회 상태별 표시만 맡는다. 조회 조건이 바뀌면 상위에서 key를 바꿔 "더 보기"를 처음으로 돌린다. */
function TradeResults({ status, data, error, onRetry }: TradeResultsProps) {
  const [visibleCount, setVisibleCount] = useState(TRADES_PAGE_SIZE);

  if (status === "pending") {
    return (
      <div role="status" aria-label="실거래가를 불러오는 중" className={styles.skeletonList}>
        {SKELETON_ROWS.map((row) => (
          <Skeleton key={row} width="100%" height="44px" />
        ))}
      </div>
    );
  }

  if (status === "error" || data === undefined) {
    return (
      <div className={styles.notice}>
        <p role="alert">{describeTradesError(error)}</p>
        {canRetryTradesError(error) && (
          <button type="button" className={styles.secondaryButton} onClick={onRetry}>
            다시 시도
          </button>
        )}
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <p className={styles.notice}>
        이 조건의 거래가 없습니다. 단지명을 지우거나 다른 시군구를 고르세요
      </p>
    );
  }

  const visibleTrades = data.items.slice(0, visibleCount);
  const hasMore = data.items.length > visibleCount;

  return (
    <div className={styles.results}>
      <p className={styles.summary}>
        최근 {data.months.length}개월 · {data.items.length}건 ·{" "}
        <a className={styles.sourceLink} href={data.source.url} target="_blank" rel="noreferrer">
          국토교통부 실거래가
        </a>
        (계약일 기준, 신고 기한 30일이라 이번 달은 일부만 있음)
      </p>
      <p className={styles.reference}>참고용이며 계산에 반영하지 않습니다</p>
      <ul className={styles.list}>
        {visibleTrades.map((trade, index) => (
          <TradeRow key={index} trade={trade} />
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => setVisibleCount((count) => count + TRADES_PAGE_SIZE)}
        >
          더 보기
        </button>
      )}
    </div>
  );
}

export default TradeResults;
