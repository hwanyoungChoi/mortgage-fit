// 서버 D1 하네스 도우미(스펙 interior-planner 태스크 0-3). `*.d1.test.ts`에서만 import한다(workerd 안에서 돈다).
// 요청은 `worker/index.ts`의 default fetch(라우터 → 핸들러)로 보내고, 세션은 `sessions` 행을 직접 심는다.
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

import worker from "../../worker/index";
import { randomBase64url, sha256Hex } from "../crypto/tokens";

import type { ListingInput } from "../../src/lib/types/listing";

export const ORIGIN = "https://loan.conychoi.dev";

/** 이 파일을 쓰기 시작한 시점의 마지막 마이그레이션. 이후 추가분은 "새 스키마"로 따로 돌린다(AC-0(f)). */
const BASELINE_LAST_MIGRATION = "0006_hidden_listings.sql";

export const ALL_MIGRATIONS = env.TEST_MIGRATIONS;
export const BASELINE_MIGRATIONS = ALL_MIGRATIONS.filter(
  ({ name }) => name <= BASELINE_LAST_MIGRATION,
);
export const PENDING_MIGRATIONS = ALL_MIGRATIONS.filter(
  ({ name }) => name > BASELINE_LAST_MIGRATION,
);

/** 적용하지 않은 것만 적용한다(`d1_migrations` 기록 기준). 부분 적용 → 시드 → 나머지 적용이 된다. */
export const migrate = (db: D1Database, migrations = ALL_MIGRATIONS) =>
  applyD1Migrations(db, migrations);

/**
 * 같은 파일의 테스트는 저장소를 공유하므로 `beforeEach`에서 부른다. 마이그레이션 기록을 뺀 모든 테이블을 비운다
 * (뒤에 추가되는 테이블도 자동으로 포함). 외래 키 검사는 커밋 때로 미뤄 삭제 순서에 기대지 않는다.
 */
export async function clearTables(db: D1Database): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
         AND name <> 'd1_migrations'`,
    )
    .all<{ name: string }>();
  await db.batch([
    db.prepare("PRAGMA defer_foreign_keys = ON"),
    ...results.map(({ name }) => db.prepare(`DELETE FROM "${name}"`)),
  ]);
}

type WorkerRequest = Parameters<typeof worker.fetch>[0];
type WorkerEnv = Parameters<typeof worker.fetch>[1];

const NO_ASSETS = {
  fetch: () => {
    throw new Error("D1 하네스는 /api/* 만 호출한다");
  },
} as unknown as Fetcher;

type ApiOptions = {
  /** `createUser`가 돌려준 쿠키. 없으면 비로그인 */
  cookie?: string;
  body?: unknown;
  /** 기본은 같은 출처. null이면 Origin 헤더를 보내지 않는다 */
  origin?: string | null;
};

/** `db`를 바인딩으로 넘겨 Worker 진입점을 부른다(스키마별 DB를 고를 수 있게). 외부 키는 넘기지 않는다. */
export function callApi(
  db: D1Database,
  method: string,
  path: string,
  { cookie, body, origin = ORIGIN }: ApiOptions = {},
): Promise<Response> {
  const headers = new Headers();
  if (cookie !== undefined) headers.set("Cookie", cookie);
  if (origin !== null) headers.set("Origin", origin);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  // 들어오는 요청의 `cf` 속성은 라우터·핸들러가 읽지 않는다.
  const request = new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as WorkerRequest;
  const workerEnv: WorkerEnv = { DB: db, ASSETS: NO_ASSETS };
  return Promise.resolve(worker.fetch(request, workerEnv));
}

export type TestUser = { id: string; cookie: string };

type UserFields = {
  budget?: number | null;
  listingOrder?: string[] | null;
  householdId?: string | null;
};

/** users 행과 유효한 세션을 심는다. 쿠키 형식은 `mf_session={id 22자}.{secret 43자}` */
export async function createUser(
  db: D1Database,
  id: string,
  { budget = null, listingOrder = null, householdId = null }: UserFields = {},
): Promise<TestUser> {
  const sessionId = randomBase64url(16);
  const secret = randomBase64url(32);
  const nowSeconds = Math.floor(Date.now() / 1000);
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, kakao_id, created_at, budget, listing_order, household_id)
         VALUES (?1, ?2, '2026-10-01T00:00:00.000Z', ?3, ?4, ?5)`,
      )
      .bind(
        id,
        `kakao-${id}`,
        budget,
        listingOrder === null ? null : JSON.stringify(listingOrder),
        householdId,
      ),
    db
      .prepare(
        `INSERT INTO sessions (id, user_id, secret_hash, created_at, last_verified_at)
         VALUES (?1, ?2, ?3, ?4, ?4)`,
      )
      .bind(sessionId, id, await sha256Hex(secret), nowSeconds),
  ]);
  return { id, cookie: `mf_session=${sessionId}.${secret}` };
}

/** 가구 행을 직접 심는다(가구는 users보다 먼저 있어야 한다: users.household_id FK) */
export async function insertHousehold(
  db: D1Database,
  id: string,
  { budget = null, listingOrder = null }: Pick<UserFields, "budget" | "listingOrder"> = {},
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO households (id, budget, listing_order, created_at)
       VALUES (?1, ?2, ?3, '2026-10-02T00:00:00.000Z')`,
    )
    .bind(id, budget, listingOrder === null ? null : JSON.stringify(listingOrder))
    .run();
}

/** 유효한 매물 필드. 필요한 것만 덮어쓴다 */
export function listingInput(overrides: Partial<ListingInput> = {}): ListingInput {
  return {
    name: "래미안 101동",
    salePrice: 125000,
    kbPrice: 120000,
    region: "regulated",
    borrower: "noHome",
    ...overrides,
  };
}

type ListingRowOptions = { hiddenHouseholdId?: string | null; createdAt?: string };

export async function insertListing(
  db: D1Database,
  userId: string,
  id: string,
  input: ListingInput = listingInput(),
  { hiddenHouseholdId = null, createdAt = "2026-10-01T00:00:00.000Z" }: ListingRowOptions = {},
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO listings (user_id, id, data, created_at, updated_at, hidden_household_id)
       VALUES (?1, ?2, ?3, ?4, ?4, ?5)`,
    )
    .bind(userId, id, JSON.stringify(input), createdAt, hiddenHouseholdId)
    .run();
}

/** 매물 `count`개를 한 문장으로 심는다. id는 `{prefix}{1..count}` */
export async function insertManyListings(
  db: D1Database,
  userId: string,
  count: number,
  prefix: string,
  { hiddenHouseholdId = null }: Pick<ListingRowOptions, "hiddenHouseholdId"> = {},
): Promise<void> {
  await db
    .prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?2)
       INSERT INTO listings (user_id, id, data, created_at, updated_at, hidden_household_id)
       SELECT ?1, ?3 || i, ?4, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', ?5 FROM n`,
    )
    .bind(userId, count, prefix, JSON.stringify(listingInput()), hiddenHouseholdId)
    .run();
}

export const countRows = async (db: D1Database, sql: string, ...params: unknown[]) =>
  (await db
    .prepare(`SELECT COUNT(*) AS count FROM ${sql}`)
    .bind(...params)
    .first<{ count: number }>())!.count;

/** 초대 토큰 형식(16바이트 base64url 22자) */
export const newInviteToken = () => randomBase64url(16);

type InviteFields = { expiresAt?: number; usedAt?: number | null; acceptedBy?: string | null };

/** 초대 행을 직접 심는다(만료·사용됨 같은 상태를 만들 때). 기본은 7일 뒤 만료, 미사용 */
export async function insertInvite(
  db: D1Database,
  inviterId: string,
  token: string,
  {
    expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    usedAt = null,
    acceptedBy = null,
  }: InviteFields = {},
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO household_invites (token_hash, inviter_id, created_at, expires_at, used_at, accepted_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(
      await sha256Hex(token),
      inviterId,
      Math.floor(Date.now() / 1000) - 60,
      expiresAt,
      usedAt,
      acceptedBy,
    )
    .run();
}

/** 가구·초대·매물·사용자 상태 전체. "실패하면 아무것도 바뀌지 않는다"를 비교할 때 쓴다 */
export async function snapshotState(db: D1Database) {
  const all = (sql: string) =>
    db
      .prepare(sql)
      .all()
      .then(({ results }) => results);
  return {
    users: await all("SELECT id, budget, listing_order, household_id FROM users ORDER BY id"),
    households: await all("SELECT * FROM households ORDER BY id"),
    invites: await all("SELECT * FROM household_invites ORDER BY token_hash"),
    listings: await all(
      "SELECT user_id, id, data, hidden_household_id, created_at, updated_at FROM listings ORDER BY user_id, id",
    ),
  };
}

/**
 * 경쟁 재현: 감싼 `db`로 처리하는 요청이 처음 `batch`를 부르기 직전(앞의 SELECT는 끝난 뒤)에 `race`를 끝까지 돌린다.
 * `Promise.all`로는 순서가 보장되지 않아 "읽은 뒤 다른 요청이 끼어든" 경우를 확실히 만들지 못한다.
 */
export function raceBeforeFirstBatch(db: D1Database, race: () => Promise<unknown>): D1Database {
  let hasRaced = false;
  return new Proxy(db, {
    get(target, property) {
      if (property === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          if (!hasRaced) {
            hasRaced = true;
            await race();
          }
          return target.batch(statements);
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
