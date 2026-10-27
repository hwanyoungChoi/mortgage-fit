import { useMutation } from "@tanstack/react-query";

import { useEndSession } from "@/hooks/useEndSession";
import { apiClient } from "@/lib/api/client";

import type { SessionHintStore } from "@/lib/types/sessionHint";

const logout = () => apiClient.post<void>("/api/auth/logout");

/** 서버 세션을 지우고(204) 이 기기의 로컬 목록·계획으로 돌아간다. 홈 계정 자리의 [로그아웃]이 쓴다. */
export function useLogout(sessionHintStore: SessionHintStore) {
  const endSession = useEndSession(sessionHintStore);
  return useMutation({ mutationFn: logout, onSuccess: endSession });
}
