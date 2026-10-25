// 로그인 사용자의 계정 예산(ADR-025 D1, `users.budget`). 값 검증은 기기 예산과 같은 `isBudgetAmount`.
// 함께 쓰는 중이면 가구 예산(`households.budget`)을 읽고 쓴다(ADR-028). 대상 선택은 householdScope 한 곳.
import { isBudgetAmount } from "../../src/lib/utils/isBudgetAmount";
import { readSharedValue, writeSharedValue } from "../household/householdScope";
import { readJsonBody } from "../http/readJsonBody";
import { errorResponse, jsonResponse } from "../http/response";

import type { BudgetResponse, ImportBudgetResponse } from "../../src/lib/types/account";

const BUDGET_MAX_BYTES = 1024;
const NO_STORE = { "Cache-Control": "no-store" };

const invalidBudget = (message: string) => errorResponse(400, "invalidParams", message);

function readBudgetField(value: unknown): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>).budget
    : undefined;
}

/** GET /api/budget → 200 `{ budget }`, 없으면 null */
export async function getBudget(db: D1Database, userId: string): Promise<Response> {
  const body: BudgetResponse = { budget: await readSharedValue<number>(db, userId, "budget") };
  return jsonResponse(200, body, NO_STORE);
}

/** PUT /api/budget `{ budget: number | null }`. null이면 지운다. 응답은 저장된 값 */
export async function putBudget(
  request: Request,
  db: D1Database,
  userId: string,
): Promise<Response> {
  const body = await readJsonBody(request, BUDGET_MAX_BYTES);
  if (!body.ok) return body.response;
  const budget = readBudgetField(body.value);
  if (budget !== null && !isBudgetAmount(budget)) {
    return invalidBudget(
      "요청 본문은 { budget } 객체이고 1~999,999,999 정수 또는 null이어야 합니다",
    );
  }

  await writeSharedValue(db, userId, "budget", "?2", budget);
  const response: BudgetResponse = { budget };
  return jsonResponse(200, response, NO_STORE);
}

/**
 * POST /api/budget/import `{ budget: number }`. 계정(가구) 예산이 비어 있을 때만 채운다.
 * 한 문장 UPDATE라 두 기기가 동시에 첫 로그인해도 먼저 온 값 하나만 남는다. 응답은 계정의 현재 값
 */
export async function importBudget(
  request: Request,
  db: D1Database,
  userId: string,
): Promise<Response> {
  const body = await readJsonBody(request, BUDGET_MAX_BYTES);
  if (!body.ok) return body.response;
  const budget = readBudgetField(body.value);
  if (!isBudgetAmount(budget)) {
    return invalidBudget("요청 본문은 { budget } 객체이고 1~999,999,999 정수여야 합니다");
  }

  const stored = await writeSharedValue<number>(
    db,
    userId,
    "budget",
    "COALESCE(budget, ?2)",
    budget,
  );
  // 세션이 있으면 users 행도 있다(sessions → users FK). 없으면 라우터가 500으로 바꾼다.
  if (stored === undefined || stored === null) throw new Error("users row missing");
  const response: ImportBudgetResponse = { budget: stored };
  return jsonResponse(200, response, NO_STORE);
}
