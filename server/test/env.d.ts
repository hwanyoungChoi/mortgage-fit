// D1 하네스(vitest.d1.config.ts)가 넘기는 바인딩. `cloudflare:workers`의 `env` 타입이 된다.
import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      /** 전체 마이그레이션(최신 스키마)용 */
      DB: D1Database;
      /** 0001~0006까지만 적용하는 스키마용(골든 응답 비교) */
      DB_BASELINE: D1Database;
      /** `migrations/*.sql`을 번호 순서대로 읽은 것 */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
