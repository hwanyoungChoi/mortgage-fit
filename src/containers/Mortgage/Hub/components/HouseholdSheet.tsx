import KakaoLoginLink from "@/components/KakaoLoginLink";
import Sheet from "@/components/Sheet";
import styles from "@/components/SheetBody.module.css";
import { ApiRequestError } from "@/lib/api/client";

import HouseholdInviteResult from "./HouseholdInviteResult";
import { useCreateHouseholdInvite } from "../hooks/useCreateHouseholdInvite";

import type { Household } from "@/lib/types/household";
import type { ListingSourceStatus } from "@/lib/types/listing";

type HouseholdSheetProps = {
  /** 홈은 로그인 상태에서만 연다. 열어 둔 동안 세션이 끝나면(401) loggedOut이 된다. */
  status: ListingSourceStatus;
  /** 이미 함께 쓰는 중이면 그 요약. 열어 둔 동안 상대가 수락하면(재조회) 여기서 바뀐다. */
  household: Household | null;
  /** 초대를 만들다 401이면 홈과 같은 세션 만료 처리 */
  onUnauthorized: () => void;
  onClose: () => void;
};

const FULL_MESSAGE = "이미 2명이 함께 쓰고 있습니다";

/** 이미 2명(409)은 안내 문구 그대로, 그 밖에는 연결 확인 안내. 401은 본문이 로그인 안내로 바뀌고 홈 안내 줄이 알린다. */
function describeCreateError(error: Error): string {
  if (error instanceof ApiRequestError && error.body?.error === "householdFull") {
    return FULL_MESSAGE;
  }
  return "초대 링크를 만들지 못했습니다. 연결을 확인하고 다시 시도해 주세요";
}

/**
 * 함께 쓰기 시트: 열어 둔 동안 세션이 끝나면 로그인 안내, 로그인·혼자면 초대 링크 만들기 → 복사·공유하기·끊기(공유 시트와 같은 모양).
 * 닫았다 다시 열면 새로 만들기부터다(시트가 새로 그려진다).
 */
function HouseholdSheet({ status, household, onUnauthorized, onClose }: HouseholdSheetProps) {
  const createInvite = useCreateHouseholdInvite();

  const handleCreate = () => {
    createInvite.mutate(undefined, {
      onError: (error) => {
        if (error instanceof ApiRequestError && error.status === 401) onUnauthorized();
      },
    });
  };

  const renderBody = () => {
    if (status === "loggedOut") {
      return (
        <>
          <p className={styles.notice}>카카오로 로그인하면 함께 쓸 수 있어요</p>
          <p className={styles.hint}>
            초대받은 사람이 수락하면 저장 목록과 인테리어 계획을 함께 씁니다.
            매물·메모·예산·순서·인테리어 계획이 둘 다에게 같게 보입니다.
          </p>
          <KakaoLoginLink isWide />
        </>
      );
    }
    if (household !== null) {
      return <p className={styles.notice}>{FULL_MESSAGE}</p>;
    }
    if (createInvite.data !== undefined) {
      return <HouseholdInviteResult invite={createInvite.data} />;
    }
    const isUnauthorized =
      createInvite.error instanceof ApiRequestError && createInvite.error.status === 401;
    return (
      <>
        <p className={styles.notice}>
          초대 링크를 받은 사람이 카카오로 로그인해 수락하면 저장 목록과 인테리어 계획을 함께
          씁니다.
        </p>
        <p className={styles.hint}>
          받은 사람의 원래 목록·인테리어 계획은 숨겨지고 내 목록·예산·순서·인테리어 계획을 함께
          씁니다. 둘 다 보고 고치고 지울 수 있습니다. 새로 만들면 전에 만든 초대 링크는 끊깁니다.
        </p>
        {createInvite.isError && !isUnauthorized && (
          <p role="alert" className={styles.error}>
            {describeCreateError(createInvite.error)}
          </p>
        )}
        <button
          type="button"
          className={styles.primaryButton}
          disabled={createInvite.isPending}
          onClick={handleCreate}
        >
          {createInvite.isPending
            ? "링크를 만드는 중"
            : createInvite.isError
              ? "다시 시도"
              : "초대 링크 만들기"}
        </button>
      </>
    );
  };

  return (
    <Sheet title="함께 쓰기" onClose={onClose}>
      <div className={styles.body}>{renderBody()}</div>
    </Sheet>
  );
}

export default HouseholdSheet;
