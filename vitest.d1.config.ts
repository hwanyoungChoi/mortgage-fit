// 서버 D1 하네스(스펙 interior-planner 태스크 0-3, ADR-029 조건 12). `*.d1.test.ts`를 workerd 안에서 돌린다.
// 기존 jsdom·node 테스트(vite.config.ts의 "app" 프로젝트)와 설정을 나눠 Testing Library setupFiles를 상속하지 않는다.
import { fileURLToPath } from "node:url";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { unstable_readConfig } from "wrangler";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// 호환 날짜·플래그·main은 배포 설정(wrangler.jsonc)에서 읽는다. 설정 경로를 플러그인에 넘기지 않는 이유:
// wrangler가 config 옆의 `.dev.vars`(실제 시크릿)를 바인딩으로 읽어 들여 로컬과 CI의 테스트 환경이 달라진다.
const wranglerConfig = unstable_readConfig({ config: fromRoot("./wrangler.jsonc") });

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: wranglerConfig.main,
      miniflare: {
        compatibilityDate: wranglerConfig.compatibility_date,
        compatibilityFlags: wranglerConfig.compatibility_flags,
        // DB: 전체 마이그레이션(최신 스키마). DB_BASELINE: 0001~0006까지만 적용한 스키마(골든 응답 비교용).
        // 로컬 시뮬레이션만 쓴다(원격 D1에 연결하지 않음). 저장소는 테스트 파일마다 새로 만들어진다.
        d1Databases: {
          ...Object.fromEntries(
            wranglerConfig.d1_databases.map(({ binding }: { binding: string }) => [
              binding,
              `test-${binding}`,
            ]),
          ),
          DB_BASELINE: "test-baseline",
        },
        bindings: { TEST_MIGRATIONS: await readD1Migrations(fromRoot("./migrations")) },
      },
    })),
  ],
  test: {
    name: "d1",
    include: ["server/**/*.d1.test.ts"],
  },
});
