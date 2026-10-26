import KakaoLoginLink from "@/components/KakaoLoginLink";
import StatusPanel from "@/components/StatusPanel";
import { useListingSource, type ListingSource } from "@/hooks/useListingSource";
import { ApiRequestError } from "@/lib/api/client";
import { HOUSEHOLD_INVITE_TOKEN_PATTERN } from "@/lib/constants/household";
import { PATHS } from "@/lib/constants/paths";

import styles from "./MortgageInvite.module.css";
import { acceptProblemOf, type AcceptProblem } from "./acceptProblem";
import { useAcceptHouseholdInvite } from "./hooks/useAcceptHouseholdInvite";
import { useHouseholdInvite } from "./hooks/useHouseholdInvite";

import type { AccountImport } from "@/hooks/useAccountImport";
import type { DraftStore } from "@/lib/types/draft";
import type { ListingStore } from "@/lib/types/listing";
import type { SessionHintStore } from "@/lib/types/sessionHint";

type MortgageInviteProps = {
  /** 주소의 토큰 그대로(모양 검사 전) */
  token: string;
  /** 로그아웃 상태의 목록 원본 */
  listingStore: ListingStore;
  sessionHintStore: SessionHintStore;
  /** 로그인 직후 이 기기 매물의 이전. 끝나야 수락할 수 있다(옮긴 매물까지 합쳐지게). */
  accountImport: AccountImport;
  /** 수락하면 편집 중인 매물 연결을 푼다(합칠 때 id가 바뀔 수 있다, ADR-028). */
  draftStore: DraftStore;
  /** 수락에 성공하면 저장 목록에 보일 알림과 함께 부른다. 이동은 부르는 쪽이 replace로 한다. */
  onAccepted: (notice: string) => void;
};

/** 화면에 남기는 수락 실패 문구. 화면이 바뀌는 이유(gone·own·alreadyInHousehold·unauthorized)는 문구 대신 화면으로 알린다. */
const ACCEPT_ERROR_MESSAGES: Record<AcceptProblem, string | null> = {
  gone: null,
  own: null,
  alreadyInHousehold: null,
  unauthorized: null,
  householdFull: "이미 2명이 함께 쓰고 있는 목록입니다",
  householdLimit: "합치면 500개를 넘어 함께 쓸 수 없습니다",
  network: "함께 쓰기를 시작하지 못했습니다. 연결을 확인하고 다시 시도해 주세요",
};

const ACCEPTED_NOTICE = "함께 쓰는 목록에 참여했습니다";

function isNotFound(error: Error): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

function GonePanel() {
  return (
    <StatusPanel
      title="만료되었거나 이미 쓴 초대입니다"
      description="초대한 사람에게 새 초대 링크를 받아 주세요"
    >
      <a className={styles.primaryLink} href={PATHS.calculator}>
        계산기로 가기
      </a>
    </StatusPanel>
  );
}

/**
 * 함께 쓰는 목록 초대 `#/invite/{token}`. 초대가 살아 있는지 먼저 묻고, 로그인 전이면 로그인(뒤 이 화면으로 복귀),
 * 로그인했으면 합쳐지는 내용과 권한을 알린 뒤 [함께 쓰기 시작]으로 수락한다.
 */
function MortgageInvite({
  token,
  listingStore,
  sessionHintStore,
  accountImport,
  draftStore,
  onAccepted,
}: MortgageInviteProps) {
  const isTokenValid = HOUSEHOLD_INVITE_TOKEN_PATTERN.test(token);
  const invite = useHouseholdInvite(token, { enabled: isTokenValid });

  const renderBody = () => {
    // 모양이 틀린 토큰은 묻지 않고 사라진 초대와 같은 화면이다.
    if (!isTokenValid || (invite.isError && isNotFound(invite.error))) return <GonePanel />;
    if (invite.isPending) return <StatusPanel title="초대를 불러오는 중" />;
    if (invite.isError) {
      return (
        <StatusPanel title="불러오지 못했습니다" description="연결을 확인하고 다시 시도해 주세요">
          <button
            type="button"
            className={styles.primaryButton}
            disabled={invite.isFetching}
            onClick={() => void invite.refetch()}
          >
            다시 시도
          </button>
        </StatusPanel>
      );
    }
    return (
      <InviteView
        token={token}
        listingStore={listingStore}
        sessionHintStore={sessionHintStore}
        accountImport={accountImport}
        draftStore={draftStore}
        onAccepted={onAccepted}
      />
    );
  };

  return <div className={styles.page}>{renderBody()}</div>;
}

/** 합쳐지는 목록 수. 로그인해 서버 목록을 받기 전에는 수를 쓰지 않는다. */
function myListCountOf(source: ListingSource): number | null {
  return source.status === "loggedIn" && source.list.status === "ok"
    ? source.list.listings.length
    : null;
}

function InviteView({
  token,
  listingStore,
  sessionHintStore,
  accountImport,
  draftStore,
  onAccepted,
}: MortgageInviteProps) {
  const source = useListingSource({ listingStore, sessionHintStore, accountImport });
  const accept = useAcceptHouseholdInvite();
  const problem = accept.isError ? acceptProblemOf(accept.error) : null;
  // 성공 뒤 이 화면을 떠날 때까지(받아 둔 me에 가구가 먼저 들어간다) "이미 함께 쓰는 중"으로 바뀌지 않게 한다.
  const isAccepting = accept.isPending || accept.isSuccess;
  const myListCount = myListCountOf(source);

  /** 두 번 눌러 두 번 수락하지 않게 누르는 동안 막는다. 성공하면 편집 연결을 풀고 저장 목록으로 간다(replace). */
  const handleAccept = () => {
    if (isAccepting) return;
    accept.mutate(token, {
      onSuccess: () => {
        if (draftStore.getSnapshot().listingId !== null) draftStore.update({ listingId: null });
        onAccepted(ACCEPTED_NOTICE);
      },
      onError: (error) => {
        if (acceptProblemOf(error) === "unauthorized") source.expireSession();
      },
    });
  };

  if (!isAccepting && problem === "gone") return <GonePanel />;
  if (!isAccepting && problem === "own") {
    return (
      <StatusPanel
        title="내가 만든 초대 링크입니다"
        description="함께 쓸 사람에게 보내 주세요. 받은 사람이 카카오로 로그인해 수락하면 같은 목록을 함께 씁니다"
      >
        <a className={styles.primaryLink} href={PATHS.listings()}>
          저장 목록으로 가기
        </a>
      </StatusPanel>
    );
  }
  if (!isAccepting && (problem === "alreadyInHousehold" || source.household !== null)) {
    return (
      <StatusPanel
        title="이미 함께 쓰는 목록이 있습니다"
        description="저장 목록에서 [나가기]로 나간 뒤 이 링크를 다시 열어 주세요"
      >
        <a className={styles.primaryLink} href={PATHS.listings()}>
          저장 목록으로 가기
        </a>
      </StatusPanel>
    );
  }

  const acceptError = problem === null ? null : ACCEPT_ERROR_MESSAGES[problem];

  /** 이전·목록 조회가 끝나기 전에는 누를 수 없고, 무엇을 기다리는지 버튼에 쓴다. */
  const startLabel = () => {
    if (isAccepting) return "함께 쓰기를 시작하는 중";
    if (source.status === "loading") {
      return accountImport.state?.status === "running"
        ? "이 기기의 매물을 계정으로 옮기는 중"
        : "계정을 확인하는 중";
    }
    return myListCount === null ? "내 저장 목록을 불러오는 중" : "함께 쓰기 시작";
  };

  const renderAction = () => {
    if (source.status === "loggedOut") {
      return (
        <>
          <KakaoLoginLink
            href={PATHS.kakaoInviteLogin(token)}
            label="카카오로 로그인하고 함께 쓰기"
            isWide
            // 수락 뒤 뒤로 가기로 초대 화면에 돌아오지 않게 한다(AC-2). 로그인 뒤 초대 화면은 서버가 새로 연다.
            shouldReplaceHistory
          />
          <p className={styles.hint}>
            로그인하면 이 화면으로 돌아옵니다. 이 기기에 저장한 매물은 먼저 내 계정으로 옮겨집니다.
          </p>
        </>
      );
    }
    if (source.status === "error") {
      return (
        <>
          <p role="alert" className={styles.error}>
            계정 상태를 확인하지 못했습니다
          </p>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={source.isRetrying}
            onClick={source.retry}
          >
            다시 시도
          </button>
        </>
      );
    }
    if (source.status === "loggedIn" && source.list.status === "loadFailed") {
      return (
        <>
          <p role="alert" className={styles.error}>
            내 저장 목록을 불러오지 못했습니다
          </p>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={source.isRetrying}
            onClick={source.retry}
          >
            다시 시도
          </button>
        </>
      );
    }
    return (
      <>
        {acceptError !== null && (
          <p role="alert" className={styles.error}>
            {acceptError}
          </p>
        )}
        <button
          type="button"
          className={styles.primaryButton}
          disabled={isAccepting || myListCount === null}
          onClick={handleAccept}
        >
          {startLabel()}
        </button>
      </>
    );
  };

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>함께 쓰는 목록 초대</h1>
        <p className={styles.description}>
          초대한 사람과 저장 목록 하나를 함께 씁니다. 한 사람이 매물·메모·상태·예산·순서를 고치면
          다른 사람에게도 같게 보입니다.
        </p>
      </header>
      <section className={styles.terms} aria-label="수락하면">
        <p>
          수락하면 내 저장 목록{myListCount === null ? "" : `(${myListCount}개)`}이 초대한 사람의
          목록과 합쳐집니다. 예산·순서는 초대한 사람 것을 함께 씁니다.
        </p>
        <p className={styles.warning}>
          초대한 사람이 내 저장 목록 전부를 보고 수정·삭제할 수 있습니다. 나가도 상대가 이미 본
          내용은 되돌릴 수 없습니다.
        </p>
      </section>
      <div className={styles.actions}>
        {renderAction()}
        <a className={styles.secondaryLink} href={PATHS.calculator}>
          취소
        </a>
      </div>
    </>
  );
}

export default MortgageInvite;
