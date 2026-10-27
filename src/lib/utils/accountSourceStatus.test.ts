// 출처 선택(useListingSource에서 옮김, ea18953 "동작 무변경")을 [우리 집]도 쓴다(스펙 interior-planner "화면 — 상태").
import { describe, expect, it } from "vitest";

import { selectAccountSourceStatus } from "./accountSourceStatus";

import type { AccountSourceStatus, MeResponse } from "@/lib/types/account";

const loggedInMe: MeResponse = { user: { id: "user-a", household: null } };
const settledFor = (settledUserId: string | null) => (userId: string) => userId === settledUserId;

const CASES: {
  name: string;
  me: MeResponse | undefined;
  isMeError: boolean;
  hasSessionHint: boolean;
  settled: string | null;
  expected: AccountSourceStatus;
}[] = [
  {
    name: "응답 전",
    me: undefined,
    isMeError: false,
    hasSessionHint: true,
    settled: null,
    expected: "loading",
  },
  {
    name: "응답 전·힌트 없음",
    me: undefined,
    isMeError: false,
    hasSessionHint: false,
    settled: null,
    expected: "loading",
  },
  {
    name: "응답 없이 실패·로그인했던 브라우저",
    me: undefined,
    isMeError: true,
    hasSessionHint: true,
    settled: null,
    expected: "error",
  },
  {
    name: "응답 없이 실패·로그인한 적 없음",
    me: undefined,
    isMeError: true,
    hasSessionHint: false,
    settled: null,
    expected: "loggedOut",
  },
  {
    name: "로그아웃",
    me: { user: null },
    isMeError: false,
    hasSessionHint: true,
    settled: null,
    expected: "loggedOut",
  },
  {
    name: "로그인·이전 전",
    me: loggedInMe,
    isMeError: false,
    hasSessionHint: true,
    settled: null,
    expected: "loading",
  },
  {
    name: "로그인·다른 사용자 이전만 끝남",
    me: loggedInMe,
    isMeError: false,
    hasSessionHint: true,
    settled: "user-b",
    expected: "loading",
  },
  {
    name: "로그인·이전 끝남",
    me: loggedInMe,
    isMeError: false,
    hasSessionHint: false,
    settled: "user-a",
    expected: "loggedIn",
  },
  {
    name: "받아 둔 응답 + 재조회 실패",
    me: loggedInMe,
    isMeError: true,
    hasSessionHint: true,
    settled: "user-a",
    expected: "loggedIn",
  },
  {
    name: "받아 둔 로그아웃 + 재조회 실패",
    me: { user: null },
    isMeError: true,
    hasSessionHint: true,
    settled: null,
    expected: "loggedOut",
  },
];

describe("selectAccountSourceStatus", () => {
  for (const { name, me, isMeError, hasSessionHint, settled, expected } of CASES) {
    it(`${name} → ${expected}`, () => {
      expect(
        selectAccountSourceStatus({
          me,
          isMeError,
          hasSessionHint,
          isImportSettled: settledFor(settled),
        }),
      ).toBe(expected);
    });
  }
});
