import { createIdsByUserStore } from "./idsByUserStorage";

import type { AccountImportStore } from "@/lib/types/accountImport";

/** 새 키(기존 키는 읽기만 하고 건드리지 않는다, AC-0) */
export const ACCOUNT_IMPORTS_STORAGE_KEY = "loan-calculator/account-imports";

/** 키 `loan-calculator/account-imports`. 사용자별로 이 기기에서 그 계정으로 옮긴(또는 옮기지 않기로 한) 매물 id */
export function createAccountImportStore({ storage }: { storage: Storage }): AccountImportStore {
  return createIdsByUserStore({ storage, key: ACCOUNT_IMPORTS_STORAGE_KEY });
}
