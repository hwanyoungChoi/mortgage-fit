// 스펙 interior-planner "수용 기준"의 예시 플랜 P(qa fixture). 요약 단위 테스트와 화면 테스트가 같은 값을 쓴다.
// 총 예산 3,000. ① 거실/도배 ② 욕실1/타일 ③ 전체/샷시 ④ 주방/주방가구(만든 순서도 이 순서).
import type {
  InteriorItem,
  InteriorPayment,
  InteriorPlanWithItems,
  InteriorQuote,
  InteriorSpace,
} from "@/lib/types/interiorPlan";

/** 방 3·욕실 2 기본 공간(AC-1 순서). id는 이름을 짐작할 수 있는 고정값이다 */
export const P_SPACES: InteriorSpace[] = [
  { id: "sp-all", name: "전체" },
  { id: "sp-entry", name: "현관" },
  { id: "sp-living", name: "거실" },
  { id: "sp-kitchen", name: "주방" },
  { id: "sp-bath1", name: "욕실1" },
  { id: "sp-bath2", name: "욕실2" },
  { id: "sp-room1", name: "방1" },
  { id: "sp-room2", name: "방2" },
  { id: "sp-room3", name: "방3" },
  { id: "sp-veranda", name: "베란다" },
];

const quote = (id: string, vendor: string, amount: number): InteriorQuote => ({
  id,
  vendor,
  amount,
});

const payment = (
  id: string,
  label: string,
  amount: number,
  dueDate: string,
  isPaid: boolean,
): InteriorPayment => ({ id, label, amount, dueDate, isPaid });

/** 시각은 `toISOString` 형식. n번째 항목은 n분에 만든다 */
export const pTime = (minute: number) => `2026-10-26T00:${String(minute).padStart(2, "0")}:00.000Z`;

/** ① 거실/도배 예산 300, 견적 A 280·B 320, A 확정, 계약금 30(11-01, 지급함)·잔금 250(11-20), 상태 확정 */
export const pWallpaper = (): InteriorItem => ({
  id: "item-wallpaper",
  spaceId: "sp-living",
  trade: "도배",
  budget: 300,
  quotes: [quote("q-a", "A도배", 280), quote("q-b", "B도배", 320)],
  confirmedQuoteId: "q-a",
  payments: [
    payment("pay-wallpaper-deposit", "계약금", 30, "2026-11-01", true),
    payment("pay-wallpaper-balance", "잔금", 250, "2026-11-20", false),
  ],
  status: "confirmed",
  createdAt: pTime(1),
  updatedAt: pTime(1),
});

/** ② 욕실1/타일 예산 600, 견적 C 650, 미확정, 상태 견적 중 */
export const pTile = (): InteriorItem => ({
  id: "item-tile",
  spaceId: "sp-bath1",
  trade: "타일",
  budget: 600,
  quotes: [quote("q-c", "C타일", 650)],
  status: "quoting",
  createdAt: pTime(2),
  updatedAt: pTime(2),
});

/** ③ 전체/샷시 예산 1,200, 견적 D 1,150·E 1,250, E 확정, 계약금 250(11-01, 지급함)·잔금 1,000(11-05), 상태 확정 */
export const pSash = (): InteriorItem => ({
  id: "item-sash",
  spaceId: "sp-all",
  trade: "샷시",
  budget: 1200,
  quotes: [quote("q-d", "D샷시", 1150), quote("q-e", "E샷시", 1250)],
  confirmedQuoteId: "q-e",
  payments: [
    payment("pay-sash-deposit", "계약금", 250, "2026-11-01", true),
    payment("pay-sash-balance", "잔금", 1000, "2026-11-05", false),
  ],
  status: "confirmed",
  createdAt: pTime(3),
  updatedAt: pTime(3),
});

/** ④ 주방/주방가구 예산 500, 견적 없음, 상태 계획 */
export const pKitchen = (): InteriorItem => ({
  id: "item-kitchen",
  spaceId: "sp-kitchen",
  trade: "주방가구",
  budget: 500,
  status: "planned",
  createdAt: pTime(4),
  updatedAt: pTime(4),
});

/** 플랜 P. 부를 때마다 새 객체라 테스트에서 고쳐도 다른 테스트에 남지 않는다 */
export function makePlanP(overrides: Partial<InteriorPlanWithItems> = {}): InteriorPlanWithItems {
  return {
    id: "plan-p",
    name: "우리 집",
    budget: 3000,
    spaces: P_SPACES.map((space) => ({ ...space })),
    createdAt: pTime(0),
    updatedAt: pTime(0),
    items: [pWallpaper(), pTile(), pSash(), pKitchen()],
    ...overrides,
  };
}

/** 항목 하나만 바꾼 P */
export function withItem(
  plan: InteriorPlanWithItems,
  itemId: string,
  change: (item: InteriorItem) => InteriorItem,
): InteriorPlanWithItems {
  return {
    ...plan,
    items: plan.items.map((item) => (item.id === itemId ? change(item) : item)),
  };
}

/** 샷시 잔금(11-05)을 지급함으로 */
export const paySashBalance = (item: InteriorItem): InteriorItem => ({
  ...item,
  payments: item.payments?.map((line) =>
    line.id === "pay-sash-balance" ? { ...line, isPaid: true } : line,
  ),
});

/** 샷시 확정을 E → D로 */
export const confirmSashD = (item: InteriorItem): InteriorItem => ({
  ...item,
  confirmedQuoteId: "q-d",
});

/** 로컬 저장소 원문 `{ plans }` */
export const toStoredPlans = (plans: InteriorPlanWithItems[]) => JSON.stringify({ plans });
