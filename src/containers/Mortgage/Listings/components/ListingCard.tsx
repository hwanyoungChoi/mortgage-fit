import Pencil from "lucide-react/icons/pencil";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";

import MaskedValue from "@/components/MaskedValue";
import { PATHS } from "@/lib/constants/paths";
import { formatManwon, formatManwonOrDash } from "@/lib/utils/amount";
import { calculateLoan, hasUnconfirmedOwnFunds } from "@/lib/utils/calculateLoan";
import { describeCondition } from "@/lib/utils/describeCondition";
import { sumExtraCosts, totalRequired } from "@/lib/utils/extraCosts";

import { budgetExcess, budgetLeft } from "../budgetExcess";
import ExtraCostList from "./ExtraCostList";
import styles from "./ListingCard.module.css";
import ListingMemo from "./ListingMemo";
import ListingNameEditor from "./ListingNameEditor";
import ListingStatusButton from "./ListingStatusButton";
import MemoEditor from "./MemoEditor";

import type { Listing, ListingSourceWriteResult } from "@/lib/types/listing";
import type { LoanResult } from "@/lib/types/loan";
import type { Regulations } from "@/lib/types/regulation";

/** 상태를 바꾸지 못한 매물과 이유. 그 매물의 펼친 카드(접혀 있으면 줄)에 한 줄로 보인다. */
export type ListingStatusFailure = { listingId: string; message: string };

type ListingCardProps = {
  listing: Listing;
  regulations: Regulations;
  /** 만원. null이면 예산 없음 */
  budget: number | null;
  onOpen: (listing: Listing) => void;
  onCopy: (listing: Listing) => void;
  onDelete: (listing: Listing) => void;
  /** 공유 시트를 연다. 시트를 닫으면 포커스를 이 버튼으로 돌려준다. */
  onShare: (listing: Listing, button: HTMLButtonElement) => void;
  onSaveMemo: (listing: Listing, memo: string) => Promise<ListingSourceWriteResult>;
  /** 이름만 바꾼다(검증된 1~40자). */
  onSaveName: (listing: Listing, name: string) => Promise<ListingSourceWriteResult>;
  /** 상태 고르기 시트를 연다. 시트를 닫으면 포커스를 `returnFocusTo`로 돌려준다. */
  onStatusOpen: (listing: Listing, returnFocusTo: HTMLElement | null) => void;
  statusFailure: ListingStatusFailure | null;
  /** 가리기 모드: 금액과 메모를 가리고 카드 머리에 [보기]를 둔다. 이름·조건·배지는 그대로다. */
  isPrivacyMode: boolean;
  /** 가리기 모드에서 잠깐 보이는 카드 하나(목록에 하나). null이면 모두 가린다. */
  revealedId: string | null;
  onRevealChange: (listingId: string | null) => void;
};

/** 계산하지 못한 매물 배지. 상태가 늘면 여기 등록하지 않은 것이 타입 검사에서 걸린다. */
const STATUS_BADGES: Record<LoanResult["status"], string | null> = {
  ok: null,
  unconfirmed: "계산 불가",
  ineligible: "계산 불가 · 요건 미충족",
};

/**
 * 핵심 지표(매매가, KB시세, 예상 한도, 자기자금)와 조건 요약. 계산된 매물은 자기자금 아래에 내역(집값 중 내 돈, 취득세 등, 중개보수)을 작게 붙인다. "수정"을 누르면 계산 화면으로 열고, "복사"는 같은 값을 새 매물로 연다. "공유"는 이 매물의 공유 링크 시트를 연다.
 * 이름 맨 앞에는 상태 칩(미지정이면 [상태])이 있고 누르면 고르기 시트가 뜬다(ADR-027). 가리기 모드에서도 보인다.
 * 예산을 넘으면 이름 앞에 "초과"와 넘는 금액을, 예산 안이면 남는 금액을 보이고, 메모가 있으면 아래에 세 줄까지 보이고(긴 메모는 펼치기) "메모"로 고친다.
 * 추가 비용이 있으면 자기자금 내역 뒤에 "추가 비용"·"총 필요 금액"을 붙이고, 그 아래에 [추가 비용 내역 n개] 펼침을 둔다.
 * 예산은 자기자금 기준 그대로라(스펙 U1) 그런 카드의 예산 문구는 "자기자금 기준"으로 한정한다(ADR-024 C4).
 * 본문은 링크가 아니다(누를 곳은 이름·상태 칩·[보기]·버튼 줄뿐이라 서로 겹치지 않는다). 목록의 `<li>`는 부모(펼친 줄)가 감싼다.
 * 가리기 모드에서는 금액·메모를 `•••`로 그리고, 카드 머리의 [보기]로 이 카드만 잠깐 보인다.
 * 버튼 줄 아래의 [인테리어 계획]은 `#/home?listing={id}`로 간다([인테리어]이 연결 계획을 열거나 그 매물로 만들기 시트를 연다).
 * "메모"는 화면을 어둡게 덮는 편집기를 열고, 닫으면 포커스를 "메모"로 돌려준다.
 * 이름을 누르면 카드 머리(이름 자리)를 입력칸으로 바꿔 그 자리에서 이름만 고친다. 고치는 동안 상태 칩·[보기]·버튼 줄은 숨기고
 * 입력칸의 [취소]·[이름 저장]만 두며, 닫으면 포커스를 이름으로 돌려준다.
 */
function ListingCard({
  listing,
  regulations,
  budget,
  onOpen,
  onCopy,
  onDelete,
  onShare,
  onSaveMemo,
  onSaveName,
  onStatusOpen,
  statusFailure,
  isPrivacyMode,
  revealedId,
  onRevealChange,
}: ListingCardProps) {
  const [isMemoOpen, setIsMemoOpen] = useState(false);
  const memoButtonRef = useRef<HTMLButtonElement>(null);
  const [isNameEditing, setIsNameEditing] = useState(false);
  const nameButtonRef = useRef<HTMLButtonElement>(null);
  const isRevealed = revealedId === listing.id;
  const isMasked = isPrivacyMode && !isRevealed;
  // 1차 형식(customLtvRate 키 없음) 매물도 그대로 넘긴다. 키가 없으면 규제 LTV로 계산된다(ADR-012).
  const result = calculateLoan(listing, regulations);
  const statusBadge = STATUS_BADGES[result.status];
  const isCustomLtv = result.appliedLtv?.source === "custom";
  const excess = budgetExcess(result.ownFunds, budget);
  const left = budgetLeft(result.ownFunds, budget);
  const memo = listing.memo ?? "";
  const extraCosts = listing.extraCosts ?? [];
  const extraTotal = sumExtraCosts(extraCosts);
  const hasExtraCosts = extraCosts.length > 0;
  // 추가 비용이 없는 카드는 이전과 글자까지 같다.
  const budgetBasis = hasExtraCosts ? "자기자금 기준 " : "";

  /** 편집기(모달)가 닫혀 뒤 화면이 다시 포커스를 받을 수 있게 된 뒤 "메모"로 포커스를 돌려준다. */
  const handleMemoClose = () => {
    flushSync(() => setIsMemoOpen(false));
    memoButtonRef.current?.focus();
  };

  /** 입력칸이 내려가고 이름이 다시 그려진 뒤 이름으로 포커스를 돌려준다. */
  const handleNameClose = () => {
    flushSync(() => setIsNameEditing(false));
    nameButtonRef.current?.focus();
  };

  return (
    <article className={styles.card}>
      {isNameEditing && (
        <ListingNameEditor
          initialName={listing.name}
          onSave={(nextName) => onSaveName(listing, nextName)}
          onClose={handleNameClose}
        />
      )}
      {isPrivacyMode && !isNameEditing && (
        <button
          type="button"
          className={styles.revealButton}
          aria-label={`${listing.name} 보기`}
          aria-pressed={isRevealed}
          onClick={() => onRevealChange(isRevealed ? null : listing.id)}
        >
          보기
        </button>
      )}
      {/* 카드 기준으로 이름 앞 자리에 앉힌다(가리기의 [보기]와 같은 방식). */}
      {!isNameEditing && (
        <ListingStatusButton
          listing={listing}
          className={isPrivacyMode ? styles.statusButtonWithReveal : styles.statusButton}
          onClick={(button) => onStatusOpen(listing, button)}
        />
      )}
      <div className={isNameEditing ? styles.bodyUnderNameEditor : styles.body}>
        {!isNameEditing && (
          <span className={isPrivacyMode ? styles.headingWithReveal : styles.heading}>
            {excess !== null && <span className={styles.overBadge}>초과</span>}
            <button
              ref={nameButtonRef}
              type="button"
              className={styles.nameButton}
              aria-label={`이름 바꾸기: ${listing.name}`}
              onClick={() => setIsNameEditing(true)}
            >
              <strong className={styles.name}>{listing.name}</strong>
              <Pencil className={styles.nameIcon} size={14} aria-hidden="true" />
            </button>
            {statusBadge !== null && <span className={styles.badge}>{statusBadge}</span>}
            {isCustomLtv && <span className={styles.customBadge}>사용자 지정</span>}
            {hasUnconfirmedOwnFunds(result) && <span className={styles.badge}>농특세 미확인</span>}
          </span>
        )}
        <span className={styles.condition}>
          {describeCondition(listing.region, listing.borrower, listing.customLtvRate)}
        </span>
        {excess !== null && (
          <span className={styles.overNote}>
            {budgetBasis}예산보다{" "}
            <MaskedValue isMasked={isMasked}>{formatManwon(excess)}</MaskedValue> 많음
          </span>
        )}
        {left !== null && (
          <span className={styles.leftNote}>
            {left === 0 ? (
              `${budgetBasis}예산에 딱 맞음`
            ) : (
              <>
                {budgetBasis}예산에서{" "}
                <MaskedValue isMasked={isMasked}>{formatManwon(left)}</MaskedValue> 남음
              </>
            )}
          </span>
        )}
        <dl className={styles.figures}>
          <div className={styles.figure}>
            <dt>매매가</dt>
            <dd>
              <MaskedValue isMasked={isMasked}>{formatManwon(listing.salePrice)}</MaskedValue>
            </dd>
          </div>
          <div className={styles.figure}>
            <dt>KB시세</dt>
            <dd>
              <MaskedValue isMasked={isMasked}>{formatManwon(listing.kbPrice)}</MaskedValue>
            </dd>
          </div>
          <div className={styles.figure}>
            <dt>예상 한도</dt>
            <dd>
              <MaskedValue isMasked={isMasked}>{formatManwonOrDash(result.loanLimit)}</MaskedValue>
            </dd>
          </div>
          <div className={styles.emphasisFigure}>
            <dt>필요한 자기자금</dt>
            <dd>
              <MaskedValue isMasked={isMasked}>{formatManwonOrDash(result.ownFunds)}</MaskedValue>
            </dd>
          </div>
          {result.status === "ok" && (
            <>
              <div className={styles.breakdown}>
                <dt>집값 중 내 돈</dt>
                <dd>
                  <MaskedValue isMasked={isMasked}>{formatManwon(result.downPayment)}</MaskedValue>
                </dd>
              </div>
              <div className={styles.breakdown}>
                <dt>{hasUnconfirmedOwnFunds(result) ? "취득세 등(농특세 제외)" : "취득세 등"}</dt>
                <dd>
                  <MaskedValue isMasked={isMasked}>
                    {formatManwon(result.purchaseCosts.acquisitionTax.total)}
                  </MaskedValue>
                </dd>
              </div>
              <div className={styles.breakdown}>
                <dt>중개보수</dt>
                <dd>
                  <MaskedValue isMasked={isMasked}>
                    {formatManwon(result.purchaseCosts.brokerageFee.total)}
                  </MaskedValue>
                </dd>
              </div>
            </>
          )}
          {hasExtraCosts && (
            <>
              <div className={styles.extraFigure}>
                <dt>추가 비용</dt>
                <dd>
                  <MaskedValue isMasked={isMasked}>{formatManwon(extraTotal)}</MaskedValue>
                </dd>
              </div>
              <div className={styles.totalFigure}>
                <dt>총 필요 금액</dt>
                <dd>
                  <MaskedValue isMasked={isMasked}>
                    {formatManwonOrDash(totalRequired(result.ownFunds, extraTotal))}
                  </MaskedValue>
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>
      {statusFailure?.listingId === listing.id && (
        <p role="alert" className={styles.statusError}>
          {statusFailure.message}
        </p>
      )}
      {hasExtraCosts && <ExtraCostList extraCosts={extraCosts} isMasked={isMasked} />}
      {/* 편집기는 화면을 덮어 뜨므로 쓰는 동안에도 뒤 카드의 모양은 그대로 둔다. */}
      {memo !== "" && <ListingMemo memo={memo} isMasked={isMasked} />}
      {!isNameEditing && (
        <div className={styles.actions}>
          <a
            className={styles.editButton}
            href={PATHS.calculator}
            aria-label={`${listing.name} 수정`}
            onClick={() => onOpen(listing)}
          >
            수정
          </a>
          <a
            className={styles.copyButton}
            href={PATHS.calculator}
            aria-label={`${listing.name} 복사`}
            onClick={() => onCopy(listing)}
          >
            복사
          </a>
          <button
            ref={memoButtonRef}
            type="button"
            className={styles.memoButton}
            aria-label={`${listing.name} 메모`}
            aria-expanded={isMemoOpen}
            onClick={() => setIsMemoOpen((isOpen) => !isOpen)}
          >
            메모
          </button>
          <button
            type="button"
            className={styles.shareButton}
            aria-label={`${listing.name} 공유`}
            onClick={(event) => onShare(listing, event.currentTarget)}
          >
            공유
          </button>
          <button
            type="button"
            className={styles.deleteButton}
            aria-label={`${listing.name} 삭제`}
            onClick={() => onDelete(listing)}
          >
            삭제
          </button>
        </div>
      )}
      {/*
       * 버튼 줄 아래 전체 폭 한 줄(U11). 계획 목록을 조회하지 않고 [인테리어]이 연결 계획을 찾는다(AC-6, ADR-029 조건 7).
       */}
      {!isNameEditing && (
        <a
          className={styles.interiorLink}
          href={PATHS.home({ listingId: listing.id })}
          aria-label={`${listing.name} 인테리어 계획`}
        >
          인테리어 계획
        </a>
      )}
      {isMemoOpen && (
        <MemoEditor
          listingName={listing.name}
          initialMemo={memo}
          onSave={(nextMemo) => onSaveMemo(listing, nextMemo)}
          onClose={handleMemoClose}
        />
      )}
    </article>
  );
}

export default ListingCard;
