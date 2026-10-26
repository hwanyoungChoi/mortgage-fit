import type { AccountImportStore } from "@/lib/types/accountImport";
import type { BudgetImportStore } from "@/lib/types/budget";
import type { ListingSnapshot } from "@/lib/types/listing";
import type { ListingOrderImportStore } from "@/lib/types/listingOrder";

type MarkDeviceImportsDoneOptions = {
  userId: string;
  /** 이 기기의 로그아웃 목록. 읽기만 한다(AC-0). */
  listingSnapshot: ListingSnapshot;
  accountImportStore: AccountImportStore;
  budgetImportStore: BudgetImportStore;
  listingOrderImportStore: ListingOrderImportStore;
};

/**
 * 수락한 사람의 기기 이전(매물·예산·순서)을 모두 끝난 것으로 기록한다. 수락 뒤의 이전은 함께 쓰는 목록으로 올라가는데,
 * 함께 쓰는 목록에는 초대한 사람의 매물·예산·순서만 있어야 한다(ADR-028 개정). 기기 원본은 지우지 않는다.
 */
export function markDeviceImportsDone({
  userId,
  listingSnapshot,
  accountImportStore,
  budgetImportStore,
  listingOrderImportStore,
}: MarkDeviceImportsDoneOptions) {
  if (listingSnapshot.status === "ok") {
    accountImportStore.add(
      userId,
      listingSnapshot.listings.map((listing) => listing.id),
    );
  }
  budgetImportStore.add(userId);
  listingOrderImportStore.add(userId);
}
