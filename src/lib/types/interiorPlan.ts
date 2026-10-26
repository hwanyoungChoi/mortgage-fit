// 인테리어 플랜(ADR-029). 공유 검증(server/)의 전이 의존이라 `@/` 별칭·DOM 타입을 쓰지 않는다.
// 금액은 모두 만원 정수 1~MAX_AMOUNT(ADR-002, D5). 선택 필드는 키 없음 = 없음(ADR-012 규칙).
// 합계·초과·할 일은 저장하지 않고 계산한다(ADR-007). 상한·이름 길이는 `constants/interiorPlan.ts`

/** 공간 하나. 순서 = 화면 순서 */
export type InteriorSpace = {
  id: string;
  /** 1~20자(코드포인트) */
  name: string;
};

export type InteriorPlan = {
  /** `^[A-Za-z0-9_-]{1,64}$`, 값 "import"는 안 된다(경로 `/api/interior-plans/import`와 겹침) */
  id: string;
  /** 1~40자(코드포인트) */
  name: string;
  /** 총 예산(만원) */
  budget?: number;
  /** 연결된 매물 id. 참조만 하고 매물이 없어도 된다(D3) */
  listingId?: string;
  /** 1~30개, id 유일 */
  spaces: InteriorSpace[];
  /** `toISOString` 형식(YYYY-MM-DDTHH:mm:ss.sssZ)만. 정렬이 문자열 비교다 */
  createdAt: string;
  updatedAt: string;
};

/** 계획 · 견적 중 · 확정 · 진행 중 · 완료. 라벨·화면 순서는 `INTERIOR_ITEM_STATUSES`·`INTERIOR_ITEM_STATUS_LABELS` */
export type InteriorItemStatus = "planned" | "quoting" | "confirmed" | "inProgress" | "done";

export type InteriorQuote = {
  id: string;
  /** 업체 1~30자 */
  vendor: string;
  /** 자유 문자열 1~30자 */
  contact?: string;
  amount: number;
  /** 1~200자 */
  memo?: string;
};

export type InteriorPayment = {
  id: string;
  /** 1~10자. 칩(계약금·중도금·잔금) 또는 직접 입력 */
  label: string;
  amount: number;
  /** YYYY-MM-DD 기기 로컬 날짜(시간대 없음) */
  dueDate?: string;
  isPaid: boolean;
};

/** 공간 × 공종 항목 하나 */
export type InteriorItem = {
  id: string;
  /** 플랜 `spaces`의 id. 형식만 검증한다(동시 편집으로 공간이 사라지면 "공간 없음" 그룹) */
  spaceId: string;
  /** 공종 1~30자. 프리셋(`INTERIOR_TRADES`) 이름과 같을 때만 공정 순서를 따른다 */
  trade: string;
  /** 항목 예산(만원) */
  budget?: number;
  /** 1~5개, id 유일 */
  quotes?: InteriorQuote[];
  /** `quotes` 중 하나의 id. 확정 업체·금액은 그 견적에서 읽는다. 확정한 견적을 지우면 이 키도 지운다 */
  confirmedQuoteId?: string;
  /** 1~5개, id 유일 */
  payments?: InteriorPayment[];
  status: InteriorItemStatus;
  /** YYYY-MM-DD */
  startDate?: string;
  /** YYYY-MM-DD, `startDate`가 있으면 그 날 이후(같은 날 포함) */
  endDate?: string;
  /** 1~500자 */
  memo?: string;
  createdAt: string;
  updatedAt: string;
};

/** 로컬 저장소(`loan-calculator/interior-plans`)·GET 응답·import 본문의 플랜 하나 */
export type InteriorPlanWithItems = InteriorPlan & { items: InteriorItem[] };

/** 플랜 필드(id·시각 제외). 서버 `interior_plans.data`에 들어가는 값 */
export type InteriorPlanInput = Pick<InteriorPlan, "name" | "budget" | "listingId" | "spaces">;

/** 항목 필드(id·시각 제외). 항목 POST·PUT 본문 `{ item }`과 서버 `interior_plan_items.data`의 값 */
export type InteriorItemInput = Omit<InteriorItem, "id" | "createdAt" | "updatedAt">;

/** 플랜 POST 본문 `{ plan }`. `items`는 만들 때 가져오기(≤30개), id·시각은 서버가 발급한다 */
export type InteriorPlanCreateInput = InteriorPlanInput & { items?: InteriorItemInput[] };

/** 플랜 PATCH 본문 `{ plan }`(JSON Merge Patch). 키 없음 = 그대로, null = 지움. 하나 이상 */
export type InteriorPlanPatch = {
  name?: string;
  budget?: number | null;
  listingId?: string | null;
  spaces?: InteriorSpace[];
};

/** 공정 순서 안내의 출처 */
export type InteriorProcessSource = {
  title: string;
  url: string;
};
