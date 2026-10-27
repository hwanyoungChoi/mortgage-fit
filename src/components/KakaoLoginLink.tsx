import { PATHS } from "@/lib/constants/paths";

import styles from "./KakaoLoginLink.module.css";

import type { MouseEvent } from "react";

type KakaoLoginLinkProps = {
  /** 로그인 시작 주소. 초대 화면은 초대 토큰을 붙여 로그인 뒤 초대로 돌아온다(`PATHS.kakaoInviteLogin`). */
  href?: string;
  label?: string;
  /** 화면의 주 동작이면 넓고 큰 버튼(48px), 아니면 머리글의 작은 버튼(36px) */
  isWide?: boolean;
  /**
   * 지금 화면을 히스토리에서 로그인으로 바꾼다. 로그인 뒤 같은 화면으로 돌아오는 경우(초대) 로그인 전 화면이
   * 뒤로 가기에 남지 않게 한다.
   */
  shouldReplaceHistory?: boolean;
};

/** 새 탭에서 열기 같은 브라우저 기본 동작은 막지 않는다. */
function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * 카카오 로그인 시작 링크. 페이지 전체가 Worker로 이동하고, 끝나면 홈 `#/`(취소·실패면 `#/?login=`, 초대 성공이면
 * `#/invite/{token}`)으로 돌아온다.
 * 색은 카카오 로그인 버튼 가이드의 컨테이너(#FEE500)·레이블(검정 85%)을 따른다.
 */
function KakaoLoginLink({
  href = PATHS.kakaoLogin,
  label = "카카오로 로그인",
  isWide = false,
  shouldReplaceHistory = false,
}: KakaoLoginLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldReplaceHistory || isModifiedClick(event)) return;
    event.preventDefault();
    window.location.replace(href);
  };

  return (
    <a className={isWide ? styles.wideLink : styles.link} href={href} onClick={handleClick}>
      {label}
    </a>
  );
}

export default KakaoLoginLink;
