import { useMutation } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

const revokeHouseholdInvite = () => apiClient.delete("/api/household/invites");

/** 내 미사용 초대를 끊는다(없어도 204). */
export function useRevokeHouseholdInvite() {
  return useMutation({ mutationFn: revokeHouseholdInvite });
}
