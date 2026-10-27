# 우리 집 — 인테리어 공정·예산 플래너 (계약 후, 턴키 없이 공간·공종별 섭외)

> 작성 2026-10-26 · 상태: 결정 D1~D5 채택(ADR-029, 구현 필수 조건 1~13 반영) · 사용자 확인 U1~U12 대기(제안 기본값으로 진행)
> 관련: ADR-002(만원 정수) · 007(입력만 저장) · 023(계정·공유) · 024(추가 비용) · 027(상태 필드·옛 번들 위험) · 028(함께 쓰기·숨김) · **029(이 기능의 저장 모델·진입·연결·범위)** · 스펙 `shared-list.md` · qa 검토 `reviews/20261026-1612-qa-catchup.md`(결함 후보 D1·D3, 서버 하네스 요청) · 스펙 검토 `reviews/20261026-1622-{be,fe,qa}-spec-interior-planner.md`
> 선행(태스크 0): 함께 쓰는 중 기기→계정 자동 이전 건너뛰기(결함 수정) + 서버 D1 테스트 하네스(리드 승인)

## 목표

계약한 집의 인테리어를 공간(거실·욕실1…)×공종(샷시·도배…) 항목으로 나눠, 업체 견적을 비교·확정하고 계약금·잔금 지급과 일정을 챙기며 **전체 예산 대비 남은 돈**을 한눈에 본다. 부부가 함께 쓰는 가구면 둘이 같은 계획을 본다. 계산기·저장 목록·함께 쓰기·공유·가리기는 지금 그대로다.

## 사용자 시나리오

1. (만들기) 저장 목록에서 계약한 매물 카드 → [인테리어 계획] → 이름(매물 이름)·총 예산·방 3·욕실 2·"추가 비용 인테리어 2줄 가져오기 ☑" → [만들기] → `#/home/{planId}`. 매물 없이 [우리 집] 탭 → [계획 만들기]도 된다.
2. (항목) [항목 추가] → 공간 "욕실1" · 공종 칩 "타일" · 예산 600 → 저장. 공간은 이름 바꾸기·추가·삭제(항목이 있으면 막음).
3. (견적) 항목을 눌러 시트에서 견적 줄 추가(업체·연락처·금액·메모) ×2~3 → 하나를 [확정] → 상태가 "확정"으로 바뀐다. 확정 금액이 예산을 넘으면 "50만원 초과".
4. (지급) 확정 항목에 지급 줄(계약금 250 · 11/1 · 지급함 ☑, 잔금 1,000 · 11/5) → 요약의 "지급함 / 앞으로 낼 돈"이 바뀐다.
5. (보기) 상단 요약(총 예산·예상 총액·남은 예산·확정·지급함·앞으로 낼 돈) → [공간별 | 공종별] 전환(공종별은 일반 공정 순서) → "할 일"(지급 예정, 견적 받기, 확정하기) → [공정 순서] 안내 시트.
6. (함께) 남편이 휴대폰에서 도배 업체를 확정 → 아내 PC는 포커스 즉시·30초 안에 같은 값.
7. (함께 쓰는 중 기기 데이터) 함께 쓰기에 참여한 B가 로그아웃 상태로 이 기기에 매물·플랜을 저장한 뒤 다시 로그인해도, 그 기기 데이터는 함께 쓰는 목록(A 화면)에 올라가지 않는다. 로그아웃하면 기기에 그대로 있고, 함께 쓰기에서 나가면 B 계정으로 옮겨진다.
8. (회귀 없음) 계산 화면이 여전히 `#/` 첫 화면이고, 저장 목록·공유 링크·함께 쓰기는 배포 전과 같다.

## 참고한 사례

- **House Project Budget(iOS)**: 프로젝트마다 목표 예산, 업체 견적 비교 후 최종 견적 표시, 지출·남은 금액·초과 표시. 무료판은 견적 3개 등 개수 제한. → 항목마다 견적 여러 개 + "확정" 하나, 요약에 남은 돈·초과. 개수 상한을 둔다. https://apps.apple.com/app/id6781284524
- **HomeZada(Home Improvement)**: 프로젝트의 항목마다 예산을 잡고 비용·영수증을 예산과 비교, 여러 업체 동시 진행용. → 예산은 항목(공간×공종) 단위, 합계는 항목에서 계산. https://homezada.com/homeowners/home-improvement
- **방별 리모델링 예산 스프레드시트(판매자 설명)**: 공종이 아니라 방 단위로 계획하고 업체별 지급(draw) 기록. → 공간×공종 두 축 + 업체(확정 견적)별 지급 줄. 판매자 주장이라 구조만 참고. https://www.etsy.com/listing/4528455524
- **공정 순서(아파트 리모델링)**: 아정당 정리 "철거 → 샷시 → 전기 배선 → 통신 → 목공 → 도장 → 타일 → 도배 → 바닥 → 가구 → 조명 → 마감 → 준공청소"(총 3~4주). 월부 글 "철거 → 설비·전기 → 목공 → 타일(습식) → 도장 → 바닥 → 도배·필름 → 조명·가구 → 청소"(감춰지는 것 먼저, 드러나는 마감 나중). → 공통 뼈대는 확인됨. **타일↔도장, 도배↔바닥(필름)의 앞뒤는 자료마다 달라 "미확인·업체와 조율"로 표시**한다. https://www.ajd.co.kr/contents/basic-tip/detail/아파트_리모델링_공사,_소요_기간과_주요_과정_알아보기-51009 · https://weolbu.com/community/2470493
- **대금 지급(토스피드 인테리어 계약서)**: 날짜가 아니라 진척도 기준, 초기엔 낮은 비율, 잔금은 검수 후. 공정위 실내건축·창호 표준계약서의 계약금·중도금·잔금 **비율은 확인하지 못함**. → 지급 줄은 이름·금액·날짜·지급 여부만, 비율 자동 제안은 넣지 않는다(지어내지 않음). https://toss.im/tossfeed/article/well-contract-05
- **Cloudflare D1 한도**: 행·문자열 최대 2,000,000바이트, 쿼리당 바인딩 100개, `batch()`는 쿼리 1회로 셈. → 크기 상한 계산과 이전 batch 설계 근거. https://developers.cloudflare.com/d1/platform/limits/
- **Cloudflare Workers 테스트(`@cloudflare/vitest-plugin`)**: 공식 문서가 `@cloudflare/vitest-pool-workers`를 대체하는 현재 권장 패키지로 안내. 1.4.7이 vitest `^4.1.0 || ^5.0.0` 지원, pool-workers 0.23.0은 `^4.1.0`뿐(qa가 npm 메타데이터와 시험 프로젝트로 확인). → 서버 D1 하네스(태스크 0-3). https://developers.cloudflare.com/workers/testing/vitest-integration/
- **우리 패턴**: 매물 = 행마다 JSON + 공용 검증(ADR-023 D4), 필드별 쓰기(ADR-027), 가구 범위 SQL + 수락 시 숨김(ADR-028 개정), 새 로컬 키만 추가(가리기·글자 크기).

## 범위

- 포함: (선행) 함께 쓰는 중 자동 이전 건너뛰기 · 서버 D1 테스트 하네스와 최소 서버 테스트 · [우리 집] 탭과 `#/home`·`#/home/{planId}` · 플랜 만들기(독립 / 매물 카드에서, 추가 비용 인테리어 줄 1회 가져오기) · 공간 편집 · 항목(공종·예산·견적·확정·지급·상태·일정·메모) · 요약·공간별/공종별 합계·할 일·공정 순서 안내 · 로컬 저장(로그아웃) · 서버 저장(로그인) · 로그인 시 로컬 플랜 이전 · 함께 쓰기 가구 공유(30초 폴링 규칙 그대로) · 같은 항목 동시 편집 경고(클라이언트) · 가리기 모드 적용
- 범위 밖: 종합 임장·계약 서비스로의 탭 재편, 계약·잔금·이사 체크리스트, 견적서 사진·영수증 첨부, 플랜 공유 링크, 업체에게 보내기, 달력 보기·일정 충돌 경고, 지급 비율 자동 계산, 매물 상태 "계약함" 추가, 플랜 복제, PDF·엑셀 내보내기, 매물(`Listing`) 형식 변경, 서버 조건부 PUT(409), 차순위 서버 테스트(카카오 콜백·세션·공유 만료 — 하네스 위에 다음 사이클)

## 데이터 모델 (D1 C 채택, ADR-029)

### 타입 (`src/lib/types/interiorPlan.ts`, 서버 공용이라 `@/` 별칭·DOM 타입 없음)

```ts
type InteriorPlan = {
  id: string; // ^[A-Za-z0-9_-]{1,64}$, 값 "import" 불가
  name: string; // 1~40자(trim)
  budget?: number; // 총 예산, 만원 정수 1~999,999,999. 없으면 키 없음
  listingId?: string; // 연결된 매물 id(참조만, FK 없음). D3
  spaces: { id: string; name: string }[]; // 1~30개, 이름 1~20자, 순서 = 화면 순서, id 유일
  createdAt: string;
  updatedAt: string; // toISOString 형식(YYYY-MM-DDTHH:mm:ss.sssZ)만
};
type InteriorItemStatus = "planned" | "quoting" | "confirmed" | "inProgress" | "done";
type InteriorItem = {
  id: string;
  spaceId: string;
  trade: string; // 공종 이름 1~30자(추가 비용 줄과 같은 상한 — 변환에 자르기 없음). 프리셋 칩 또는 직접 입력. 공정 순서는 이름이 프리셋과 같을 때만
  budget?: number; // 만원 정수
  quotes?: {
    id: string;
    vendor: string /*1~30*/;
    contact?: string /*≤30*/;
    amount: number /*1~999,999,999*/;
    memo?: string; /*≤200*/
  }[]; // ≤5, id 유일
  confirmedQuoteId?: string; // quotes 중 하나. 확정 업체·금액은 여기서 읽는다(중복 저장 안 함). 확정한 견적을 지우면 확정도 풀린다
  payments?: {
    id: string;
    label: string /*1~10*/;
    amount: number /*1~999,999,999*/;
    dueDate?: string /*YYYY-MM-DD, 실제 달력 날짜*/;
    isPaid: boolean;
  }[]; // ≤5, id 유일
  status: InteriorItemStatus;
  startDate?: string;
  endDate?: string; // YYYY-MM-DD, end ≥ start
  memo?: string; // ≤500자
  createdAt: string;
  updatedAt: string;
};
```

- 빈 값은 키를 쓰지 않는다(ADR-012 규칙). 합계·초과·할 일은 저장하지 않고 계산한다(ADR-007).
- 금액은 **만원 정수**(D5, ADR-002)다. 예산·견적·지급 모두 `Number.isSafeInteger`이고 1~999,999,999. 소수 입력은 기존 `validateAmount`처럼 오류로 거부하고 반올림하지 않는다. 표시는 기존 `formatManwon`을 쓴다.
- 필수 필드는 처음부터 있는 것(`id`·`name`·`spaces`·`status`·시각)만이고, **앞으로 더하는 필드는 모두 선택 필드**(키 없음 = 기본)로 한다(qa D3: 옛 번들이 새 데이터를 손상으로 보지 않게).
- **매물 형식은 바꾸지 않는다**: `Listing`·`validateListingFields`(`isListing`)·`parseListingRequests`는 이번 사이클에 한 줄도 바뀌지 않는다(더 엄격하게도, 필드 추가도 없음). 매물 연결은 플랜 쪽 `listingId`로만 한다(D3 A).
- 상한(`src/lib/constants/interiorPlan.ts`): 플랜 3 · 항목/플랜 100 · 견적 5 · 지급 5 · 공간 30.
- 검증은 `src/lib/utils/validateInteriorPlan.ts` 하나(`isInteriorPlan`, `isInteriorItem`)를 로컬 읽기·서버 경계·이전에 같이 쓴다. **서버는 검증 뒤 알려진 키만 새 객체로 복사해 저장**한다(알 수 없는 키를 통과시키면 아래 크기 계산이 무력해진다). `spaces[].id`·`quotes[].id`·`payments[].id`·import `items[].id`는 유일해야 한다(겹치면 400). 시각은 `toISOString` 고정 형식만(정렬이 문자열 비교). 서버 전용 파싱(봉투, PATCH 부분 검증, import 유일성)은 `server/interiorPlans/`에 두고 공용 파일에는 도메인 규칙만 둔다.
- 순수 함수는 모두 `src/lib/utils/`에 둔다(컴포넌트에 묻지 않는다): 공간 기본값 생성, 공종 정렬, 그룹 합계·요약·할 일(`summarizeInteriorPlan`), 견적 확정·삭제 시 상태 전이, 추가 비용 → 항목 변환.
- 공정 순서 단계와 공종 프리셋은 **한 상수(14개: 철거·샷시·설비·전기·목공·타일·욕실·도장·필름·도배·바닥·주방가구·조명·입주 청소, 타일 → 욕실 순)**에서 파생한다. 직접 입력 공종은 맨 뒤에 입력순.

### 크기 상한 계산 (UTF-8 한글 3바이트)

- 항목 최악: 견적 5 × (id 32 + 업체 90 + 연락처 90 + 금액 9 + 메모 600 + 키 ~60 ≈ 880) ≈ 4.4KB + 지급 5 × ~150 ≈ 0.75KB + 메모 1.5KB + 나머지 ~0.3KB ≈ **7.0KB** (be 재계산: 연락처 한글 30자 = 90바이트)
- 플랜 본문 최악: 공간 30 × ~120 + 이름 등 ≈ **4KB** → 플랜 하나(항목 100) ≈ 0.7MB, 3개 ≈ 2.1MB. **이 수치는 D1 저장 한도가 아니라 GET 응답과 import 본문 크기다.** D1의 2,000,000바이트는 행·문자열 단위인데 C 모델의 행은 항목 ~7KB·플랜 ~4KB다.
- 서버: 항목 쓰기 본문 16KB, 플랜 쓰기 16KB, 이전은 플랜 1개씩 1MB(바인딩 본문이 2MB 안). GET 전체 최악 ~2.1MB(보통 수십 KB).
- 로컬: 새 키 최악 ~2.1MB. 쓰기 실패(용량 초과)는 기존처럼 `unavailable`로 알리고 기존 키는 건드리지 않는다.
- 짝 없는 서로게이트(`\uXXXX` 6바이트) 최악은 위의 2배다. 이전 본문은 `useAccountImport`처럼 **보낼 본문을 실제로 재서** 1MB 미만인지 확인하고, 넘으면 그 플랜은 이전 실패로 안내한다(qa가 최악값 계산 확인).

### 브라우저 저장소 (새 키 2개만, 기존 12개 키는 이름·형식·값 그대로)

- `loan-calculator/interior-plans`: `{ plans: (InteriorPlan & { items: InteriorItem[] })[] }` — 로그아웃 상태의 원본. 스토어는 쓰기 직전에 저장소를 다시 읽어 바뀐 부분만 반영한다(탭 둘이 열려 있어도 서로 통째로 덮지 않게).
- `loan-calculator/interior-plan-imports`: **`Record<userId, planId[]>`** (`account-imports`와 같은 형태, `account-imports`와 공용 `idsByUserStorage` 사용). 이전을 끝낸 플랜 id를 기록하므로 로그인 뒤 로그아웃 상태에서 새로 만든 플랜도 다음 로그인에 올라간다.
- 기존 키(코드 기준 12개: account-imports·budget·budget-imports·draft·listing-order·listing-order-imports·listings·privacy-mode·sent-shares·session-hint·text-size·trade-lookup)는 **읽기 경로에서 `setItem`·`removeItem`·`clear` 0회**(앱 시작·탭 이동·[우리 집] 사용·로그인·함께 쓰는 중 이전 건너뛰기 모두). 기존 키에 쓰는 것은 사용자가 그 기능을 직접 조작할 때뿐이다(지금과 같음).

### `migrations/0007_interior_plans.sql` (추가만, 기존 테이블·행을 읽거나 고치지 않음)

```sql
CREATE TABLE interior_plans (
  user_id             TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, -- 만든 사람(나가기 때 이 사람 것)
  id                  TEXT NOT NULL,
  data                TEXT NOT NULL,   -- JSON: name, budget?, listingId?, spaces
  hidden_household_id TEXT,            -- listings와 같은 규칙(수락 시 B 플랜 숨김). NULL = 보임
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  PRIMARY KEY (user_id, id)            -- 로컬 id를 그대로 옮기므로 listings와 같은 PK
);
CREATE INDEX interior_plans_hidden_household_id ON interior_plans (hidden_household_id)
  WHERE hidden_household_id IS NOT NULL;

CREATE TABLE interior_plan_items (
  plan_user_id TEXT NOT NULL,
  plan_id      TEXT NOT NULL,
  id           TEXT NOT NULL,
  data         TEXT NOT NULL,          -- JSON: InteriorItem에서 id·시각 뺀 것
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (plan_user_id, plan_id, id),
  FOREIGN KEY (plan_user_id, plan_id) REFERENCES interior_plans (user_id, id) ON DELETE CASCADE
);
```

- 범위: `PLAN_SCOPE_SQL = user_id IN (${MEMBER_IDS_SQL}) AND hidden_household_id IS NULL` (`householdScope.ts`에 추가). 항목 쿼리는 숨김 컬럼이 없으므로 **항목 GET·POST·PUT·DELETE가 모두 `householdScope.ts`의 같은 "한 플랜 범위 조각"**(`(plan_user_id, plan_id) IN (SELECT user_id, id FROM interior_plans WHERE ${PLAN_SCOPE_SQL} AND id = ?)` 형태, 이름은 be가 정함)을 쓴다 — 범위 통과를 빠뜨린 쿼리 하나가 숨긴 플랜의 항목을 노출한다. 불변식: 범위 안 플랜 id는 겹치지 않는다(이전·POST가 지킴). 항목 테이블에도 `id`·`created_at`이 있어 비한정 열 이름이 바깥 테이블로 해석되지 않는지 하네스로 확인한다(숨긴 플랜·타인 플랜 id로 PUT/DELETE → 404).
- 함께 쓰기(D4 A): 수락 batch에 `UPDATE interior_plans SET hidden_household_id = 가구 WHERE user_id = B AND hidden_household_id IS NULL AND 가구 존재`를 **마지막 문장(users UPDATE) 앞**에 추가한다(성공 판정은 `results[results.length - 1]` 그대로, 바인딩 3개를 listings 문장과 똑같이 넘김). 나가기 batch에는 `UPDATE interior_plans SET hidden_household_id = NULL WHERE hidden_household_id = 가구`를 **배열 맨 끝**에 추가하고, 기존 `const [, , , cleared]` 인덱스 의존을 `users` UPDATE 결과를 이름으로 찾는 코드로 바꿔 문장 추가에 밀리지 않게 한다(qa catchup 1번). 이 변경은 0-4 테스트가 먼저 머지된 뒤에 한다.
- 복합 FK의 CASCADE가 D1에서 동작하는지 be가 `--local`과 하네스로 먼저 확인한다(qa 시험에서 로컬은 동작). 안 되면 FK를 빼고 플랜 DELETE batch에서 항목을 같이 지운다. 원격 CASCADE는 리드가 4-2에서 플랜 삭제 후 항목 0행을 한 번 확인한다.

## API 계약

공통 규칙(JSON 오류 `{error,message}`, `no-store`(성공 응답 포함), Origin 검사, 세션 쿠키, 본문 한도 413)은 기존 공통 부품을 그대로 쓴다. 모두 인증 필수(401), 쓰기는 Origin(403). 상한 초과는 400 `invalidParams`(listings와 같음). 요청·응답 봉투는 매물과 같은 규칙으로 `{ plan }`·`{ item }`이다.

| Method | Path                                      | Request                                                                                                         | Response                                                                                                                                                     | 에러                                                                           |
| ------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| GET    | `/api/interior-plans`                     | —                                                                                                               | 200 `{ plans: (InteriorPlan & { items })[] }` 범위 안 전부, `ORDER BY created_at, id` / 항목 `ORDER BY created_at, id`. 플랜·항목 쿼리를 **한 `db.batch`**로 | 401                                                                            |
| POST   | `/api/interior-plans/import`              | `{ plan: InteriorPlan & { items } }` 1개(id·시각 그대로)                                                        | 200 `{ imported: 0\|1 }` 범위에 같은 id가 있으면 0(상한에 걸려도 0, 재시도 안전)                                                                             | 400(검증·플랜 3개 초과), **409 `inHousehold`(요청자가 가구 구성원)**, 413(1MB) |
| POST   | `/api/interior-plans`                     | `{ plan: { name, budget?, listingId?, spaces, items? } }` (`items`는 만들 때 가져오기, **≤30**, id는 서버 발급) | 201 `{ plan: InteriorPlan & { items } }`. id·시각은 서버                                                                                                     | 400(검증·플랜 3개), 413                                                        |
| PATCH  | `/api/interior-plans/{id}`                | `{ plan: { name?, budget?(null=지움), listingId?(null=지움), spaces? } }` 하나 이상                             | 200 `{ plan }`(json_patch 한 문장)                                                                                                                           | 400(검증·**경로 id 형식 오류**), 404                                           |
| DELETE | `/api/interior-plans/{id}`                | —                                                                                                               | 204(항목 CASCADE)                                                                                                                                            | 400(경로 id 형식), 404                                                         |
| POST   | `/api/interior-plans/{id}/items`          | `{ item }` 항목 입력(id·시각 없음, 서버 발급)                                                                   | 201 `{ item }`                                                                                                                                               | 400(검증·100개), 404(플랜 없음)                                                |
| PUT    | `/api/interior-plans/{id}/items/{itemId}` | `{ item }` 항목 입력 전체                                                                                       | 200 `{ item }`(항목 단위 마지막 저장 우선)                                                                                                                   | 400(검증·경로 id 형식), 404                                                    |
| DELETE | `/api/interior-plans/{id}/items/{itemId}` | —                                                                                                               | 204                                                                                                                                                          | 400(경로 id 형식), 404                                                         |

- **라우팅**: `/api/interior-plans/import`는 `/api/interior-plans/{id}`보다 **먼저** 라우팅한다(라우터는 첫 일치라 뒤면 POST import가 405). 경로 id 형식이 틀리면 매물과 같은 400 `invalidParams`, id `import`는 검증에서 거부한다(PATCH·DELETE가 import 경로에 가려지지 않게).
- 플랜·항목 조회·쓰기는 위 범위 조각으로 찾고, 다른 사람·숨긴 플랜은 404.
- **항목 넣기 가드(import·POST 공통)**: 항목 INSERT는 같은 batch의 **직전 플랜 INSERT가 1행을 넣었을 때만** 돈다(예: `changes()` 가드 또는 INSERT가 만든 표식 — D1 batch에서 되는지 be가 하네스로 확인해 고른다). 따라서 import 재시도 때 사용자가 지운 항목이 되살아나지 않고, POST에서 플랜 3개 초과로 플랜이 0행이면 항목도 0행이다. 하네스 변이 테스트로 고정한다(가드 삭제 시 실패).
- **이전(import) batch**: 플랜 INSERT…SELECT는 "같은 id가 범위에 없을 때만 개수 < 3을 비교"한다(`importListings`의 `IMPORT_OVER_LIMIT_SQL`과 같은 식). 그래서 플랜이 이미 있으면 상한에 걸린 상태여도 400이 아니라 `imported: 0`이다. 항목 INSERT…SELECT FROM json_each는 위 가드를 쓴다.
- **항목 POST의 404/400 구분**: 개수 검사와 넣기는 한 문장이고, 같은 batch의 두 번째 문장이 플랜 범위 존재를 읽어 0행이면 404, 있으면 400(100개)을 낸다.
- **import 409**: 요청자가 가구 구성원(`users.household_id IS NOT NULL`)이면 409 `inHousehold`. 새 엔드포인트라 옛 클라이언트가 없고, 클라이언트 `me.household`가 낡았을 때도 서버가 최종 판단한다. 기존 매물 import에는 넣지 않는다(동작 무변경, 태스크 0 클라이언트 수정으로 막음).
- 옛 Worker + 새 스키마는 새 테이블을 안 쓰므로 그대로 동작한다. **새 Worker + 옛 스키마면 수락·나가기 batch가 `no such table`로 실패해 나가기가 막히므로**, 배포 순서는 원격 0007 적용 → PR 머지다(CI에는 migrations apply가 없다).
- 롤백: 플랜이 있는 가구가 생긴 뒤 옛 Worker로 되돌리면 나간 사람의 플랜이 숨긴 채 남는다.
- 태스크 0은 서버 API를 바꾸지 않는다(클라이언트가 이전 요청을 보내지 않을 뿐).

## 동기화·이전 규칙

- **함께 쓰는 중 자동 이전 건너뛰기(태스크 0, U10 제안 기본값)**: `me.user.household !== null`이면 기기→계정 자동 이전을 모두 보내지 않는다 — 매물(`useAccountImport`), 예산(`useBudgetSource`), 직접 순서(`useListingOrderSource`), 이번에 생기는 플랜 이전까지. 이때
  - 세 훅의 이전 상태에 **`skipped`(사유 `"household"`)를 따로 둔다**(기존 `done`으로 두면 같은 userId라 나간 뒤 다시 돌지 않는다). 이전 기록 키(`account-imports`·`budget-imports`·`listing-order-imports`·`interior-plan-imports`)에는 **기록하지 않는다**(나간 뒤 옮길 수 있게). 기기 원본 키도 읽기만 한다.
  - `skipped`는 "끝남(건너뜀)"으로 보아 서버 목록 조회를 막지 않는다(`isAccountImportSettled`가 참). 예산·순서는 `skipped`여도 계정 조회를 켠다(`isImportDone`에 skipped 포함, 안 그러면 가구 중에 예산 줄이 loading에 멈춘다). "옮겼습니다" 알림·다른 계정 확인창도 가구 중에는 띄우지 않는다(나간 직후 다른 계정 기록이 있으면 기존 확인창이 뜰 수 있다).
  - **`skipped`이고 `household === null`이면 다시 실행**한다. 같은 세션에서 `me.user.household`가 null로 바뀌면(나가기, 상대 나가기 후 재조회) 그때 한 번 이전을 실행한다. 이전 대상은 지금처럼 기록에 없는 것만.
  - 수락한 그 기기에서 기기 데이터를 "이전 완료"로 표시하는 기존 `markDeviceImportsDone`은 매물·예산·순서에 대해 그대로 둔다(수락 전 기기 데이터는 나가도 올리지 않는다는 기존 동작 유지). **플랜 이전 기록은 수락 때 미리 완료 표시하지 않는다.**
  - 서버 쪽 최종 방어는 `/api/interior-plans/import`의 409 `inHousehold`뿐이다(기존 매물 import는 서버 무변경).
- **플랜 충돌·최신화**: 항목 단위 마지막 저장 우선, 플랜 필드(이름·예산·연결·공간)는 PATCH 필드 단위. 쿼리는 `staleTime: 0` + 포커스 재조회, 가구일 때만 30초(`householdRefetchInterval` 재사용).
- **같은 항목 동시 편집(클라이언트만)**: 항목 시트를 연 시점의 `updatedAt`과 저장 직전 캐시의 `updatedAt`이 다르면 "다른 사람이 고쳤습니다"를 띄우고 최신 값으로 다시 불러오게 한다(저장하지 않음). 서버 409(조건부 PUT)는 이번에 넣지 않는다.

## 화면

- **상단 탭**: `계산 | 저장 목록 | 우리 집` + [가가]. `#/`는 계속 계산(메인). 라우트 `{ name: "home"; planId?: string; listingId?: string; view?: "space" | "trade" }` — `#/home`(0개: 빈 상태, 1개: 그 플랜, 2~3개: 플랜 고르기), `#/home/{planId}`, `#/home?listing={id}`(연결 플랜이 있으면 `#/home/{planId}`로 replace, 없으면 만들기 시트를 그 매물로 채워 엶, 열고 나면 주소에서 지움). `TAB_ORDER`는 `TABS`에서 파생한다(탭 추가 누락이 타입·테스트에서 걸리게).
- **빈 상태**: "계약한 집의 인테리어 예산·견적·지급을 정리합니다" + [계획 만들기] + "저장 목록의 매물 카드에서도 만들 수 있어요".
- **만들기 시트**: 이름 · 총 예산(선택) · 방 수(1~5, 기본 3) · 욕실 수(1~3, 기본 2) · (매물에서 왔으면) "추가 비용 인테리어 n줄 가져오기"(n>0일 때만, 기본 체크).
- **플랜 화면**: 요약 줄(총 예산 · 예상 총액 · 남은 예산(음수면 "예산 초과 n만원") · 확정 · 지급함 · 앞으로 낼 돈) → 할 일 → [공간별 | 공종별] 목록(그룹마다 합계, 항목 줄 = 공종·상태·확정 금액 또는 예산·초과 표시) → [항목 추가]. 머리글 작은 버튼 줄: [공간 편집] [공정 순서] [가리기] [⋯(이름·예산·매물 연결 해제·삭제)]. 연결 매물이 없어졌으면 "연결된 매물이 삭제되었습니다"(플랜은 그대로).
- **[공간별|공종별] 선택**은 주소 쿼리 `?view=trade`(없으면 공간별)로 유지한다. `parseRoute`는 허용 값 밖의 `view`·형식 밖의 `planId`·`listing`을 맞춰 준다. 마지막으로 연 플랜은 주소 `#/home/{planId}`와 메모리로 유지(새 로컬 키 안 만듦).
- **항목 시트**: 공간 · 공종(프리셋 칩 + 직접 입력) · 예산 · 견적 줄(추가·삭제·[확정] 라디오) · 지급 줄(계약금/중도금/잔금 칩 + 직접, 날짜, 지급함 체크, "지급 합계 1,200 / 확정 1,250 — 50 남음") · 상태 · 시작·끝 날짜 · 메모 · [저장]. 오류는 그 칸 아래에, 저장 실패 시 입력 유지. 확정한 견적 줄을 지우면 확정도 풀린다. 같은 항목이 시트를 연 뒤 다른 사람 저장으로 바뀌었으면 위 "같은 항목 동시 편집" 안내.
- **할 일 정의**: "지급 예정" = 지급함이 아닌 지급 줄(날짜순, 기기 오늘보다 앞이면 "지남"), "견적 받기" = 견적 0개이고 미확정인 항목, "확정하기" = 견적 1개 이상이고 미확정인 항목.
- **공정 순서 시트**: 철거 → 샷시 → 설비 → 전기 → 목공 → 타일 → 욕실 → 도장 → 필름 → 도배 → 바닥 → 주방가구 → 조명 → 입주 청소(14단계, 공종 프리셋과 같은 상수) + "타일과 도장, 도배와 바닥의 앞뒤는 자료마다 다릅니다. 업체와 일정을 맞추세요" + 출처 2개 + 기준일.
- **저장 목록 매물 카드**(펼친 카드): [인테리어 계획]을 **버튼 줄(수정·복사·메모·공유·삭제) 아래 전체 폭 한 줄 링크**로 둔다(U11 제안 기본값). 카드는 플랜 GET을 부르지 않고 항상 `#/home?listing={id}`로 보낸다. Home이 그 매물에 연결된 플랜을 찾으면 `#/home/{planId}`로 `replace`하고(여럿이면 첫 번째), 없으면 만들기 시트를 연다. 연결 끊김 문구는 매물 목록이 확정 로드된 뒤에만 판단한다.
- **상태**: 출처 loading이면 로딩, 서버 조회 실패 "불러오지 못했습니다 [다시 시도]", 401은 기존 세션 만료 안내. 함께 쓰는 중 404는 "함께 쓰는 사람이 삭제한 항목입니다".
- **반복 사용 불편 방지**: 시트는 뒤로 가기로 닫힘(기존 `useOpenSheet`) · 폴링으로 데이터가 바뀌어도 열린 항목 시트의 입력은 유지(MemoEditor 규칙) · 가리기 켜면 금액·연락처·메모를 렌더하지 않음(기존 키를 읽기만, `MaskedValue`는 `src/components/`로 승격해 Listings와 Home이 같이 씀).

## 수용 기준

> 예시 플랜 **P**(qa 테스트 fixture로도 쓴다): 총 예산 3,000. 항목 ① 거실/도배 예산 300, 견적 A 280·B 320, A 확정, 지급 계약금 30(11-01, 지급함)·잔금 250(11-20), **상태 확정** ② 욕실1/타일 예산 600, 견적 C 650, 미확정, **상태 견적 중** ③ 전체/샷시 예산 1,200, 견적 D 1,150·E 1,250, E 확정, 지급 계약금 250(11-01, 지급함)·잔금 1,000(11-05), **상태 확정** ④ 주방/주방가구 예산 500, 견적 없음, **상태 계획**. 모든 금액은 만원 정수 덧셈·뺄셈뿐이라 내림·올림이 없다.
> **계산 정의**: 예상 총액 = Σ(확정 금액, 없으면 예산). 확정 = 확정 항목의 확정 금액 합. 지급함 = 모든 지급함 줄의 합. **앞으로 낼 돈 = 확정 항목별 `max(확정 금액 − 그 항목의 지급함 합, 0)`의 합**(확정 안 된 항목의 지급 줄은 더하지 않고, 과지급 항목은 0).
> **표시**: 아래 금액은 만원 정수 값이고 화면 문자열은 기존 `formatManwon`을 쓴다(예: 50 → "50만원", 12,000 → "1억 2,000만원"). 소수 입력은 거부한다.
> 검증: `pnpm lint`·`format:check`·`test`·`build`, 리드는 360×780 화면, `curl`(쓰기는 `-H 'Origin: https://loan.conychoi.dev'`), `pnpm wrangler d1 execute mortgage-fit --remote --json --command "…"`. 서버 AC는 태스크 0의 하네스 테스트로도 고정한다.

- [ ] **AC-0 (최우선, 기존 데이터·동작 그대로)**: (a) 원격 0007 적용 직전·직후 덤프 `diff`가 빈다: 행 수(users·sessions·listings·shares·households·household_invites), `SELECT id,kakao_id,budget,listing_order,household_id,created_at FROM users ORDER BY id`, `SELECT user_id,id,data,hidden_household_id,created_at,updated_at FROM listings ORDER BY user_id,id`, `SELECT token,kind,expires_at FROM shares ORDER BY token`, `SELECT id,inviter_id,budget,listing_order FROM households ORDER BY id`. **직후에는 새 테이블 `interior_plans`·`interior_plan_items`가 0행임도 확인한다.** (b) 혼자 쓰는 계정·가구 계정 모두 배포 전·후 `GET /api/me`·`/api/listings`·`/api/budget`·`/api/listing-order` 응답이 같다. (c) 배포 전 main으로 매물·메모·예산·순서·작성 중 입력·가리기·글자 크기를 넣은 비로그인 브라우저에서 새 빌드로 [우리 집] 플랜을 만들고 써도 기존 12개 키 원문이 바이트 단위로 같고 새 키는 `interior-plans`(·`interior-plan-imports`)뿐이다. (d) 배포 전 `#/share/{token}`·`#/invite/{token}`이 지금처럼 동작한다. (e) 옛 Worker + 새 스키마에서 위 API와 매물 저장·삭제가 200/201/204. (f) 함께 쓰기 수락·나가기의 매물 숨김·복귀, A·B 예산·순서 복원 결과가 배포 전과 같다 — 태스크 0 하네스 테스트로 0007 전(0001~0006)과 후(0001~0007) 모두 통과. (g) **형식 안전**: `git diff $(git merge-base HEAD main) -- src/lib/utils/validateListingFields.ts src/lib/types/listing.ts server/listings/parseListingRequests.ts`가 비어 있다(`isListing`을 더 엄격하게 만들지 않음, 매물 필드 추가 없음). 플랜의 새 필드는 위 필수 목록 외 모두 선택 필드이고, 선택 키가 모두 없는 최소 플랜·항목이 `isInteriorPlan`·`isInteriorItem`을 통과한다. 기존 키 읽기 경로(앱 시작·각 탭 진입·로그인 확인·이전 건너뛰기)에서 **허용 목록(`interior-plans`·`interior-plan-imports`) 밖의 모든 키**에 대한 `setItem`·`removeItem`·`clear` 호출이 0회임을 스파이 Storage로 단언하고(예외: 이번 사이클 전부터 있던 로그인 확인 결과에 따른 `session-hint` 정리 — `useListingSource`, 동작 무변경. qa task-1 확인 1), 시드한 기존 키 원문을 `===`로 비교한다(같은 값을 다시 쓰는 것은 스파이만 잡는다).
- [ ] **AC-1 (탭·만들기·로컬 유지)**: 탭 순서 `계산 | 저장 목록 | 우리 집`, `#/` 첫 화면은 계산. 로그아웃 상태 [우리 집] → 빈 상태 → [계획 만들기] 이름 "우리 집", 방 3·욕실 2 → 공간이 정확히 `전체, 현관, 거실, 주방, 욕실1, 욕실2, 방1, 방2, 방3, 베란다`(10개) 순서. 새로고침 후 그대로. 방 1·욕실 1이면 7개(`욕실1`·`방1`만).
- [ ] **AC-2 (요약 계산)**: P에서 예상 총액 = Σ(확정 금액, 없으면 예산) = 280+600+1,250+500 = **2,630**, 남은 예산 **370**, 확정 **1,530**, 지급함 **280**, 앞으로 낼 돈(위 정의: ① 280−30=250, ③ 1,250−250=1,000) **1,250**, 항목 ③에 "50만원 초과". 총 예산을 2,500으로 바꾸면 "예산 초과 130만원". 총 예산이 없으면 남은 예산 칸 대신 "총 예산 입력". `summarizeInteriorPlan` 단위 테스트와 화면 값이 같다.
- [ ] **AC-3 (공간별·공종별·공정 순서)**: P 공간별 합계는 화면 공간 순서대로 전체 1,250 · 거실 280 · 주방 500 · 욕실1 600(항목 없는 공간은 숨김). 공종별은 샷시 → 타일 → 도배 → 주방가구 순(공정 순서 상수 기준, 타일은 욕실보다 앞), 직접 입력 공종은 맨 뒤 입력순(예: 방충망을 먼저, 단열을 나중에 입력하면 방충망 → 단열). [공정 순서] 시트에 14단계·"자료마다 다릅니다" 문구·출처 2개·기준일이 보이고, 공종 프리셋 칩 순서가 같은 상수에서 나온다. [공간별|공종별] 선택이 `?view=trade`로 주소에 남고 새로고침·뒤로 가기 후에도 같다.
- [ ] **AC-4 (할 일·지급)**: 기기 날짜 2026-11-10(테스트는 `now` 주입)에서 "지급 예정"이 샷시 잔금 1,000(11-05, "지남") → 도배 잔금 250(11-20) 순, "견적 받기"에 주방가구(견적 0개·미확정), "확정하기"에 타일(견적 1개 이상·미확정). 샷시 잔금을 지급함으로 바꾸면(E 확정 그대로) 그 줄이 사라지고 지급함 1,280, 앞으로 낼 돈 250. **앞으로 낼 돈 정의를 가르는 값**: (a) P에서 견적 D**만** 확정으로 바꾸면(샷시 잔금 미지급) 확정 1,430(280+1,150)·"50만원 초과" 사라짐·지급함 280·앞으로 낼 돈 **1,150**(① 250 + ③ 1,150−250=900). (b) 샷시 잔금 지급함 **+** 견적 D 확정이면 확정 1,430·지급함 1,280·앞으로 낼 돈 **250**(① 250 + ③ max(1,150−1,250, 0)=0, 과지급 항목은 0). 확정한 견적을 삭제하면 `confirmedQuoteId`가 같이 지워져 확정이 풀린다.
- [ ] **AC-5 (검증·상한·오류 위치)**: 업체 이름 빈칸·금액 0·1,000,000,000·소수(`123.5` → "정수(만원 단위)로 입력하세요", 반올림하지 않음)·끝 < 시작은 그 칸 아래 오류로 저장 막힘(입력 유지). 공종 이름 30자는 통과, 31자는 오류. 견적 5개면 [견적 추가] 비활성, 항목 100개면 [항목 추가] 비활성, 플랜 3개면 [계획 만들기] 비활성. 항목이 있는 공간 삭제 → "이 공간의 항목 n개를 먼저 옮기거나 지우세요". 서버는 같은 검증 함수로 400을 낸다(`quotes` 6개, `confirmedQuoteId`가 견적에 없음, `dueDate: "2026-13-01"`, 중복 `quotes[].id`·`spaces[].id`, `+09:00` 형식 시각, 지급 금액 0·소수·1,000,000,000, 경로 id 형식 오류, id `import`, POST `items` 31개, 알 수 없는 키는 저장되지 않음, 16KB 넘는 항목 413).
- [ ] **AC-6 (매물 연결·추가 비용 가져오기)**: 매물 "래미안 84"(추가 비용 인테리어/도배 300, 인테리어/샷시 1,200, 가전/냉장고 400) 카드 [인테리어 계획](버튼 줄 아래 전체 폭 링크)은 플랜 목록 GET 없이 `#/home?listing={id}`로 가고, 만들기 시트 이름 "래미안 84", "추가 비용 인테리어 2줄 가져오기" 체크 → 항목 전체/도배 예산 300·전체/샷시 예산 1,200(상태 계획), 총 예산 1,500, 냉장고는 없음. 줄 이름 30자는 자르지 않고 공종으로 들어간다(공종 상한도 30자). 같은 카드 [인테리어 계획]은 이제 `#/home/{planId}`로 replace되어 그 플랜을 연다(연결 플랜이 여럿이면 첫 번째). 매물 원문(로컬 키 원문 / D1 `listings.data`)은 전후 같다. 매물을 지우면 플랜은 남고 "연결된 매물이 삭제되었습니다".
- [ ] **AC-7 (서버 저장)**: 로그인 상태에서 플랜·항목을 만들고 고치면 D1 `interior_plans` 1행·`interior_plan_items` n행, 다른 기기는 포커스 재조회로 같은 값. 쿠키 없이 → 401, Origin 다르면 403, 다른 계정의 플랜 id로 PATCH·항목 PUT → 404. 응답은 `{ plan }`·`{ item }` 봉투이고 성공 응답에도 `no-store`. 플랜 DELETE 후 그 플랜 항목 0행. `POST /api/interior-plans/import`는 `/{id}` 경로에 가려지지 않고 200. 항목 POST는 플랜이 없으면 404, 100개면 400. 혼자 쓰는 사용자는 30초 주기 요청이 없다. (하네스 테스트로 고정)
- [ ] **AC-8 (로그인 이전)**: 로그아웃 상태에서 플랜 1개(항목 3개)를 만든 뒤 카카오 로그인(혼자 쓰는 계정) → 계정에 플랜 1·항목 3(같은 id), "이 기기의 인테리어 계획을 계정으로 옮겼습니다" 1회. 로그아웃·재로그인해도 중복 없음(`interior-plan-imports`에 userId별 planId). 로그인 뒤 로그아웃 상태에서 새로 만든 플랜은 다음 로그인에 올라간다. 로컬 매물과 함께 옮긴 플랜의 `listingId` 연결이 유지된다. `import`를 같은 본문으로 두 번 보내면 두 번째 `{ imported: 0 }`이고, **계정에 이미 플랜 3개가 있어도 같은 id면 400이 아니라 `{ imported: 0 }`**(다른 id면 400). 첫 import 뒤 항목을 지우고 같은 본문을 다시 보내도 항목이 되살아나지 않는다(가드 삭제 변이에서 테스트가 실패해야 함). 가구 구성원이 보내면 409 `inHousehold`.
- [ ] **AC-9 (함께 쓰기)**: A(플랜 PA)·B(플랜 PB)가 가구가 되면 둘 다 PA만 보고, B가 PA 항목을 고치면 A 화면에 포커스 즉시·30초 안에 반영. 둘이 다른 항목을 동시에 저장하면 둘 다 남는다. 같은 항목은 시트를 연 뒤 상대가 저장하면 저장 직전 "다른 사람이 고쳤습니다"가 뜨고 덮어쓰지 않는다. 함께 쓰는 동안 B가 만든 플랜 PC는 둘 다 본다. B가 나가면 B는 PB·PC, A는 PA만 보고, B가 PA에 넣은 항목은 PA에 남는다. D1: 수락 직후 `SELECT COUNT(*) FROM interior_plans WHERE hidden_household_id = '{그 가구 id}'` = 1(B의 플랜이 PB 하나라는 전제), 나간 뒤 0. 수락·나가기 후 `useAcceptHouseholdInvite`·`useLeaveHousehold`가 플랜 목록 쿼리를 무효화해 옛 범위의 플랜이 남지 않는다.
- [ ] **AC-10 (함께 쓰는 중 자동 이전 건너뛰기, 태스크 0)**: **전제: B는 다른 기기에서 수락했다(이 기기에는 B의 이전 기록이 없다).** A·B 가구. B가 이 기기에서 로그아웃 상태로 매물 2개 저장·기기 예산 8억·순서 변경(태스크 1 뒤에는 플랜 1개도) → 다시 로그인 → `POST /api/listings/import`·`/api/budget/import`·`/api/listing-order/import`(·`/api/interior-plans/import`) 요청 0건, A 화면 목록·예산·순서 그대로, B 화면에 "옮겼습니다" 알림·확인창 없음, 서버 목록이 로딩에 멈추지 않는다(예산·순서 줄도 loading에 멈추지 않음). 4개 이전 기록 키가 로그인 전후 바이트 같고 기기 원본 키 원문이 그대로다. 로그아웃하면 그 2개가 기기 목록에 보인다. B가 [나가기] → 같은 세션에서 2개가 B 계정으로 옮겨지고 "이 기기의 매물 2개를 계정으로 옮겼습니다". **이 기기에서 수락한 경우**는 수락 때 `markDeviceImportsDone`이 그 시점 기기 매물 id·예산·순서를 이미 기록하므로(기존 동작 유지) 나간 뒤에도 그것들은 옮기지 않고 수락 뒤 새로 만든 매물만 옮겨진다. 플랜은 수락 때 미리 기록하지 않으므로 기록에 없는 기기 플랜이 나간 뒤 옮겨진다. 혼자 쓰는 계정의 로그인 이전은 배포 전과 같다(기존 흐름 회귀 없음). **`useAccountImport`·`useBudgetSource`·`useListingOrderSource` 세 훅 각각** 훅 테스트로 `household !== null`이면 `send`를 호출하지 않고 기록도 없으며 settled가 참임, 같은 userId에서 `household`가 null로 바뀌면 `send` 1회(두 번째 가입→나가기 전환에서 중복 전송 없음, 가구 상태의 `retry()`는 `send` 0회)를 고정하고, 세 훅 모두에서 "조건 삭제"와 "null 전환 뒤 재실행 코드 삭제" 두 변이에서 테스트가 실패함을 확인한다.

## 태스크

### 파일 소유 (병렬 가능하게 겹치지 않음)

- **be**: `src/lib/types/interiorPlan.ts`(도메인·API 타입), `src/lib/constants/interiorPlan.ts`(프리셋·공정 순서 14개 한 상수·상한·라벨), `src/lib/utils/validateInteriorPlan.ts`, `migrations/0007_interior_plans.sql`, `server/interiorPlans/*`(새), `server/household/householdScope.ts`·`handleHousehold.ts`, `worker/index.ts`
- **fe**: 그 밖의 `src/` — `src/hooks/useAccountImport.ts`, `Listings/hooks/useBudgetSource.ts`·`useListingOrderSource.ts`(태스크 0), `src/lib/utils/interiorPlanStorage.ts`·`interiorPlanImportStorage.ts`·`summarizeInteriorPlan.ts`와 그 밖의 계획용 순수 함수, `src/lib/types/route.ts`·`parseRoute`·`paths`, `src/components/TabNav.tsx`(`TAB_ORDER`를 `TABS`에서 파생), `src/AppRoutes.tsx`, `src/hooks/useInteriorPlan*.ts`(API 훅·출처·이전), **`useLeaveHousehold`·`useAcceptHouseholdInvite`(무효화 키에 `interiorPlanListQueryKey()` 추가)**, **`MaskedValue`(`Listings/components/` → `src/components/` 승격, Listings의 import 갱신)**, `src/containers/Mortgage/Home/*`(새), `Listings` 카드 링크. (Invite 수락 시 플랜 이전 기록 완료 표시는 하지 않는다.)
- **qa**: 새 `*.test.ts(x)` 파일, 서버 하네스(`package.json` devDependencies·`pnpm-lock.yaml`의 하네스 패키지, 서버 테스트용 vitest 설정 파일, `server/test/*` 도우미). 제품 코드는 고치지 않고 결함은 담당과 `파일:라인`으로 보고. 깨지는 기존 테스트는 그 파일 소유자가 고친다. 태스크마다 `.cony/reviews/{시각}-qa-task-{n}.md`(AC 표·AC-0 줄·새 테스트·변이 확인·미검증).

### 목록

- [x] 0. 선행 안전망 (작고 먼저) — AC-10, AC-0(f)(g)의 하네스
  - [ ] 0-1. 함께 쓰는 중이면 매물·예산·순서 자동 이전을 보내지도 기록하지도 않고 `skipped`(사유 household)로 둠, `skipped`이고 `household === null`이면 한 번 다시 실행, 예산·순서는 `skipped`여도 계정 조회를 켬 ("동기화·이전 규칙") (fe)
  - [ ] 0-2. 세 훅(`useAccountImport`·`useBudgetSource`·`useListingOrderSource`) 각각의 테스트(가구면 `send` 0회·기록 0회·settled 참, null로 바뀌면 `send` 1회, 두 번째 전환 중복 없음, 가구 상태의 `retry` 0회, 혼자 쓰는 흐름 그대로) + 세 훅 모두 변이 확인 (qa)
  - [ ] 0-3. 서버 D1 하네스 도입: 패키지는 **`@cloudflare/vitest-plugin`**(`@cloudflare/vitest-pool-workers`는 vitest 5 미지원). 실제 `migrations/0001~` 전부를 순서대로 적용한 D1로 `worker/index.ts` 경로(또는 핸들러)를 호출. `test.projects`로 기존 jsdom·node 테스트와 D1 프로젝트를 분리하고(D1 프로젝트는 Testing Library `setupFiles`를 상속하지 않음), **전환 전후 699 통과 + 1 todo가 같다**. **수락 조건: `rm -rf dist && pnpm test` 통과**(이 프로젝트의 `wrangler.jsonc`로 확인). 세부(타입 설정, `nodejs_compat` 주의, PR 설명에 근거·베타 miniflare 의존·버전 고정)는 qa 검토 `reviews/20261026-1622-qa-spec-interior-planner.md`의 "0-3 하네스" 1~6을 따른다. (qa)
  - [ ] 0-4. 최소 서버 테스트: `LISTING_SCOPE_SQL`(혼자 = `user_id = ?1`과 같은 결과, 숨긴 행 제외), listings GET·POST(500 상한 한 문장)·PUT(memo·status 보존)·PATCH(다른 필드 불변)·DELETE·import(중복 id 건너뛰기·상한·재시도), 가구 수락(B 매물 숨김·가구 생성·동시 수락 하나만 200·`ownInvite`·`alreadyInHousehold`)·나가기(숨김 해제·A 예산·순서 = 가구 값·B 원래 값·동시 나가기 뒤 404). 401·403 각 1건. **보완 범위**: `/api/me`·`/api/listings`·`/api/budget`·`/api/listing-order` 골든 응답을 0001~0006과 0001~0007 두 번, 수락 실패 분기(없는·만료·사용된 토큰, A 매물 501개 → 409 `householdLimit`, 실패 시 아무것도 안 바뀜), 동시 나가기·수락은 `db`를 Proxy로 감싼 경쟁 재현, 라우터 경로 순서·405, 중요 가드 변이 확인(`[, , , cleared]` 인덱스 이동, `householdExists` 가드 삭제). 세부는 qa 검토의 "0-4"를 따른다. 2-1 머지 전에 0-4가 통과한 커밋을 기록해 둔다. (qa)
- [x] 1. 로컬로 끝까지 되는 플래너 (엔드투엔드 최소) — AC-1~5, AC-0(c)(g)
  - [ ] 1-1. 계약 3파일(타입·상수·검증) 먼저 커밋. **fe·be 다음 작업은 이 커밋 뒤**. `src/lib/utils/validateInteriorPlan.ts`가 `tsconfig.worker.json` 빌드에 포함되는지 `pnpm build`로 확인 (be)
  - [ ] 1-2. 로컬 스토어(새 키, 쓰기 직전 재읽기, 손상·접근 불가 처리), `summarizeInteriorPlan`(요약·그룹 합계·할 일, `now` 주입)과 계획용 순수 함수(공간 기본값, 공종 정렬, 상태 전이, 확정 견적 삭제 시 확정 해제), 라우트 `home`(`?view=`)·탭·`TAB_ORDER` 파생, `MaskedValue` 승격, `Home` container(빈 상태·만들기·공간 편집·항목 시트·요약·공간별/공종별·할 일·공정 순서 시트·가리기) (fe)
  - [ ] 1-3. 검증 함수 경계표(최소 플랜 통과·각 상한 바로 안팎·소수 거부·공종 30자·id 유일성·시각 형식)·요약(P 값, AC-4 구분 값 두 개)·스토어(허용 목록 밖 키 `setItem` 0회)·라우트 파싱(`view`)·화면 테스트 (qa)
- [x] 2. 서버 저장·로그인 이전·함께 쓰기 — AC-7~9, AC-0(a)(b)(e)(f)
  - [ ] 2-1. 0007(`--local` 적용 후 AC-0(a) 쿼리로 전후 비교), `PLAN_SCOPE_SQL`과 항목용 한 플랜 범위 조각, 엔드포인트 8개(봉투 `{ plan }`·`{ item }`, `import` 먼저 라우팅, 경로 id 400, id `import` 거부, POST `items` ≤30·서버 발급 id, GET 한 `db.batch`, 항목 POST 404/400 구분, import 항목 가드·상한 식·409 `inHousehold`), 검증은 알려진 키 복사·id 유일성·시각 형식·금액 `isSafeInteger`, 수락·나가기 batch 문장 추가(수락은 마지막 앞, 나가기는 맨 끝 + 이름으로 `cleared` 조회), worker 경로. 0-4 테스트와 기존 `server/**` 테스트 통과 (be)
  - [ ] 2-2. API 훅(`interiorPlanListQueryKey` 함수형, 항목 PUT·POST 응답은 `setQueryData`로 해당 항목만 갱신), 출처 훅(loading·loggedOut·loggedIn·error, `useListingSource` 규칙과 같음, 가구일 때만 30초), 로그인 이전(플랜 1개씩, 본문 실측, `Record<userId, planId[]>` 기록, **가구면 `skipped` — 0-1 규칙 그대로**, 409 `inHousehold`는 건너뜀으로 처리), 수락·나가기 훅의 무효화에 플랜 목록 키 추가, 같은 항목 동시 편집 경고(`updatedAt` 비교), 나가기 확인 문구에 항목 귀속 한 줄(U12) (fe)
  - [ ] 2-3. 하네스로 플랜 핸들러 테스트(범위·404·상한 한 문장·import 재시도(플랜 3개 상태의 같은 id → `imported: 0`)·항목 가드 변이·409 `inHousehold`·라우트 순서·CASCADE·수락 숨김/나가기 복귀·0006 시점 데이터에 0007 적용 후 기존 테스트 그대로), 출처·이전 훅 테스트 (qa)
- [x] 3. 매물 연결·추가 비용 가져오기 — AC-6
  - [ ] 3-1. 카드 [인테리어 계획] 전체 폭 링크(`#/home?listing={id}`, 플랜 GET 없음), Home의 연결 플랜 찾기 → `#/home/{planId}` replace, 인테리어 분류 줄 → 공간 "전체" 항목 변환(순수 함수), 연결 매물 없음 표시 (fe)
  - [ ] 3-2. 가져오기 변환 함수 표(인테리어 줄 0·1·30개, 이름 30자)·카드 진입(플랜 GET 0회)·replace 테스트, 매물 원문 불변 확인 (qa)
- [ ] 4. 배포·검증 (리드)
  - [ ] 4-1. time-travel 복원 지점 기록 → AC-0(a) 직전 덤프 → **원격 0007 적용**(`pnpm wrangler d1 migrations apply mortgage-fit --remote`) → 직후 덤프·`diff`(새 테이블 2개 0행 확인 포함) → AC-0(e) 옛 Worker 확인
  - [ ] 4-2. **그 다음에** PR 머지(Auto-fix + CI 통과 시 자동 머지라 PR이 곧 배포, CI에는 migrations apply가 없으므로 순서를 사람이 지킨다. 새 Worker + 옛 스키마면 나가기가 막힌다). 배포 후 AC-0(b)~(d)(f), AC-1~10 화면·curl 확인, 원격 플랜 삭제 후 항목 0행 확인

의존 관계: 0-1·0-3은 즉시 병렬(서로 독립, 1-1과도 병렬). 0-1은 서버 변경이 없어 **단독 PR로 먼저 배포할 수 있다**(사용자 확인 U10 전에는 제안 기본값으로). 0-4는 0-3 뒤, **2-1(household batch 수정)보다 먼저 머지**해 수정 전 동작을 고정한다. 1-1 → (1-2 ∥ 2-1) → 2-2(2-1의 API 타입 확정 뒤) → 3-1(1-2·2-2 뒤) → 4. qa는 각 구현 직후. **1~3은 한 PR로 배포**(로그인 사용자가 로컬에만 쓰는 중간 상태를 운영에 내지 않는다).

## 다음 단계 후보

- 종합 임장·계약 서비스 재편: 탭 [계산·매물·우리 집]에서 [우리 집]에 계약·중도금·잔금·대출 실행·이사·전입 체크리스트를 얹기
- 매물 상태 "계약함"(옛 번들 호환을 확인한 뒤, ADR-027 확장)과 계약 매물 자동 연결
- 견적서·영수증 사진 첨부(R2), 업체 연락처 모음
- 달력 보기·공정 순서와 일정 충돌 경고(예: 도배 시작이 목공 끝보다 이름)
- 지급 비율 제안(표준계약서 원문 확인 후), 예비비(%) 칸
- 플랜 공유 링크(값 복사, ADR-023 패턴)·PDF/엑셀 내보내기
- 같은 항목 동시 편집이 잦으면 서버 조건부 PUT(409) 또는 항목 필드별 PATCH
- 가전·가구·이사 추가 비용도 플랜으로 가져오기
- 하네스 위 차순위 서버 테스트: 카카오 콜백 state·초대 쿠키, 세션 만료·연장, 라우터 405/403/500, 공유 만료, `parseListingRequests`
- 함께 쓰는 중 기기 데이터를 확인창으로 골라 올리기(U10 대안)
- 옛 탭 손상 판정 방지용 번들 버전 확인 장치(qa D3)

## 가정

- A1: 보통 플랜은 1개(계약한 집). 3개 상한은 이사·세컨드 하우스 정도의 여유.
- A2: 항목은 시트 [저장]으로 통째 PUT. 같은 항목을 둘이 30초 안에 동시에 고치면 마지막 저장 우선이되, 클라이언트가 `updatedAt` 비교로 "다른 사람이 고쳤습니다"를 띄워 조용한 덮어쓰기를 줄인다(서버 409는 없음). 다른 항목은 영향 없음. 공간 목록도 PATCH `{spaces}` 통째.
- A3: 확정 업체는 견적 중 하나를 고르는 방식이다(전화로 들은 금액도 견적으로 적는다). 확정하면 상태가 계획·견적 중일 때만 "확정"으로 올라가고, 그 외 상태는 수동. 확정한 견적을 지우면 확정이 풀린다.
- A4: 지급 합계가 확정 금액과 달라도 막지 않고 차이만 보인다. 확정 안 된 항목의 지급 줄도 허용하되 "앞으로 낼 돈"에는 더하지 않고, 과지급 항목은 0으로 센다.
- A5: 날짜는 기기 로컬 날짜 `YYYY-MM-DD`(시간대 없음). "지남"은 기기 오늘 기준.
- A6: 동시 편집 경합으로 공간이 사라진 항목은 "공간 없음" 그룹에 보인다(데이터는 지우지 않음).
- A7: 연락처는 자유 문자열 30자. 숫자·하이픈·공백만이면 `tel:` 링크.
- A8: 매물 연결은 참조만이라, 함께 쓰기에서 숨겨진 매물·삭제된 매물을 가리키면 "연결된 매물이 삭제되었습니다"로 같게 보인다. 함께 쓰기에서 나간 뒤 상대 목록의 매물에 연결된 플랜도 같은 연결 끊김 표시로 보인다.
- A9: 태스크 0에서 "가구에 있는지"는 `/api/me`의 `user.household`로 판단한다. me 응답 전에는 지금처럼 이전을 시작하지 않는다(출처 loading). 상대가 나가 가구가 해체된 것은 다음 me 재조회(포커스·30초)에 알게 되고 그때 이전이 한 번 돈다.
- A10: 하네스는 테스트 전용 devDependency이고 런타임 번들·Worker 배포물에 들어가지 않는다. 리드 승인 범위(테스트 하네스) 안에서 qa가 패키지를 고른다(`@cloudflare/vitest-plugin`으로 결정, ADR-029).

## 결정 필요

D1~D5는 모두 **채택(ADR-029)**이다. 아래는 선택지와 근거 기록이고, 구현 필수 조건은 ADR-029 조건 1~13으로 위 본문에 반영했다.

- **D1 데이터 모델 — 채택(ADR-029): C**
  - A 정규화(plans·spaces·items·quotes·payments 5테이블): 서버 집계 쿼리가 쉬움 / 테이블·핸들러·검증이 5벌, 이전·가구 숨김 문장이 5배, 로컬 형식과 서버 형식이 달라짐
  - B 플랜 JSON 한 덩어리(`interior_plans.data`): 가장 단순, 로컬 형식과 같음 / 저장마다 최악 ~0.7MB PUT, 부부가 서로 다른 항목을 고쳐도 한쪽이 덮어써짐(30초 폴링이라 실제로 잦음)
  - **C 플랜 행 + 항목 행(각 JSON)**: 매물(행마다 JSON + 공용 검증)과 같은 패턴, 항목 단위 마지막 저장 우선이라 다른 항목 동시 편집이 안전, 쓰기 본문 16KB / 견적·지급 단위 동시 편집은 항목 안에서 덮어씀(클라이언트 `updatedAt` 경고로 완화)
  - 이유: 함께 쓰기 사용 장면(둘이 각자 업체 통화 후 입력)에서 B는 손실이 나고, A는 지금 필요 없는 집계 때문에 복잡도가 크다. 뒤집을 조건: 서버에서 지급 일정 알림(크론) 등 견적·지급 단위 조회가 필요해지거나 같은 항목 동시 편집 충돌이 잦으면(조건부 PUT 409 또는 필드별 PATCH, 지급 알림이면 A).
- **D2 정보 구조 — 채택(ADR-029): A**
  - **A [우리 집] 세 번째 탭 + 매물 카드 [인테리어 계획] 진입**: 계산이 첫 탭·`#/` 기본이라 "메인은 계산기"를 지킴, 계약 후엔 매일 여는 화면이라 탭 한 번, 종합 서비스로 갈 때 [우리 집]에 체크리스트를 얹을 자리 / 계약 전 사용자에게도 탭이 보임(빈 상태 안내로 처리), 360px 탭 폭 fe 확인
  - B 탭 없이 카드 진입만(`#/home/{id}`): 화면 변화 최소 / 매일 쓰는데 매번 목록→카드 펼치기 필요, 매물 없는 플랜에 길이 없음
  - C 저장 목록 위 "우리 집" 섹션: 탭 수 유지 / 이미 무거운 목록 화면(사용자 지적)이 더 무거워짐
- **D3 매물 연결 — 채택(ADR-029): A**
  - **A 플랜의 선택 필드 `listingId`(참조만) + 만들 때 이름·추가 비용 인테리어 줄 1회 복사**: 매물 형식·검증 무변경(AC-0(g)), 로컬 id가 이전 때 그대로라 로그인 후에도 연결 유지 / 매물을 지우면 연결만 끊김
  - B 매물 상태에 `contracted` 추가 후 그 매물에서만 플랜: 흐름이 자연스러움 / 매물 검증 값이 늘어 옛 번들이 목록 전체를 손상으로 볼 위험(ADR-024 뒤집을 조건, qa D3), 서버·로컬 검증 동시 변경
  - C 연결 없음(독립만): 가장 단순 / 추가 비용 가져오기·카드 진입이 불가
- **D4 함께 쓰기에서 플랜 범위 — 채택(ADR-029): A**
  - **A 매물과 같은 규칙**: 만든 사람(`user_id`) 소유, 가구 구성원이 보고 수정, 수락 시 B 플랜 숨김·나가면 복귀(ADR-028 개정과 일관) / 수락·나가기 batch에 문장 1개씩 추가(기존 문장·성공 판정 불변, 0-4 테스트로 고정)
  - B 숨기지 않고 구성원 플랜 모두 보임: household 코드 무수정 / 수락 직후 B의 옛 플랜이 A 쪽에 섞이고 매물만 숨기는 규칙과 어긋남
  - C 플랜을 가구 소유(`household_id`)로: 공유 의미가 분명 / 나가기 때 누구 것인지 정할 근거가 없고 혼자 쓰는 사용자 경로가 따로 생김
- **D5 금액 단위 — 채택(ADR-029): A 만원 정수(ADR-002)** / B 원 정수. A는 기존 금액 입력·표시 컴포넌트(`validateAmount`·`formatManwon`)와 추가 비용 가져오기를 그대로 쓰고, 인테리어 견적은 대부분 만원 단위다. 1만원 미만 소수 입력은 기존처럼 오류로 거부한다. B는 앱 안에서 단위가 섞이고 변환이 생긴다. 뒤집을 조건: 실제 견적에서 천원 단위 정밀도가 필요하다는 피드백.

## 사용자 확인 필요

제품 기본값이다. 답이 오기 전에는 제안 기본값으로 구현한다(U9만 크기 계산과 묶여 있어 올리면 크기 계산을 다시 한다. 나머지는 상수·문구·조건이라 바꿔도 데이터가 깨지지 않는다).

- U1 탭 이름: **"우리 집"**(나중에 계약·이사 기능도 담는 자리). 대안 "인테리어".
- U2 공간 프리셋: **전체 · 현관 · 거실 · 주방 · 욕실1~n · 방1~n · 베란다**, 만들 때 방 수(기본 3)·욕실 수(기본 2)만 고르고 이후 이름 변경·추가·삭제.
- U3 공종 프리셋(= 공정 순서, 한 상수 14개): **철거 · 샷시 · 설비 · 전기 · 목공 · 타일 · 욕실 · 도장 · 필름 · 도배 · 바닥 · 주방가구 · 조명 · 입주 청소** + 직접 입력. "청소"는 "입주 청소" 하나로 합침.
- U4 상태: **계획 · 견적 중 · 확정 · 진행 중 · 완료** 5단계, 수동 선택(확정 업체를 고르면 "확정"으로 자동).
- U5 지급 단계: **계약금 · 중도금 · 잔금 칩 + 직접 입력**, 비율 자동 계산 없음(출처 미확인).
- U6 예산 초과·남은 돈: 남은 예산 = 총 예산 − 예상 총액(**확정 금액, 없으면 항목 예산**). 항목·전체 모두 초과 금액을 보이되 저장은 막지 않음.
- U7 추가 비용 가져오기: 매물의 **인테리어 분류 줄만**, 공간 "전체"·줄 이름을 공종으로, 총 예산 = 그 합계, **1회 복사**(이후 매물 추가 비용과 동기화 안 함). 가전·가구·이사는 가져오지 않음.
- U8 공유 범위: **함께 쓰기 가구만** 같은 플랜을 봄. 매물 [공유]·[목록 공유] 링크에는 플랜을 넣지 않음. [가리기]를 켜면 우리 집 화면도 금액·연락처·메모를 가림.
- U9 상한: **플랜 3 · 항목 100 · 견적 5 · 지급 5 · 공간 30**, 메모 500자·견적 메모 200자.
- U10 함께 쓰는 중 기기 데이터(태스크 0, 지금 운영 결함 수정): **가구에 있는 동안 기기 매물·예산·순서(·플랜)를 계정으로 자동으로 올리지 않는다**. 기기에는 그대로 남아 로그아웃하면 보이고, 함께 쓰기에서 나가면 내 계정으로 옮겨진다. 근거: 사용자 결정 "함께 쓰는 목록에는 초대한 사람 목록만"(ADR-028 개정). 대안: 로그인 때 "이 기기의 매물 n개를 함께 쓰는 목록에 올릴까요?" 확인창(다음 단계 후보).
- U11 매물 카드의 [인테리어 계획] 배치(제품 기본값 · 사용자 확인 전): **버튼 줄(수정·복사·메모·공유·삭제) 아래 전체 폭 한 줄 링크**. 근거: 줄이 이미 5칸이라 6칸이면 360px에서 "인테리어 계획"이 한 칸에 안 맞는다. 대안: 줄 안에서 "인테리어"(4자)로 줄임.
- U12 나갈 때 항목 귀속 안내(제품 기본값 · 사용자 확인 전): 함께 쓰기 **나가기 확인 문구에 한 줄** — "함께 쓰는 동안 상대가 내 플랜에 넣은 항목은 내 플랜과 함께 나가고, 내가 상대 플랜에 넣은 항목은 그 플랜에 남습니다". 근거: 플랜은 만든 사람 소유라 항목이 플랜을 따라가고(매물 메모와 같은 규칙), 사용자에게는 의외일 수 있다. 대안: 안내 없음.
