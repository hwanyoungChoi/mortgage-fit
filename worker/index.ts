import { handleAptTrades } from "../server/aptTrades/handleAptTrades";
import { getMe, logout } from "../server/auth/handleAccount";
import { finishKakaoLogin, startKakaoLogin } from "../server/auth/handleKakaoAuth";
import { withSession } from "../server/auth/session";
import { getBudget, importBudget, putBudget } from "../server/budget/handleBudget";
import {
  acceptHouseholdInvite,
  createHouseholdInvite,
  getHouseholdInvite,
  leaveHousehold,
  revokeHouseholdInvite,
} from "../server/household/handleHousehold";
import { routeApi } from "../server/http/router";
import {
  getListingOrder,
  importListingOrder,
  putListingOrder,
} from "../server/listingOrder/handleListingOrder";
import {
  createListing,
  deleteListing,
  importListings,
  listListings,
  replaceListing,
  updateListingFields,
} from "../server/listings/handleListings";
import { createShare, getShare, revokeShare } from "../server/shares/handleShares";

import type { ApiRoute } from "../server/http/router";

// 시크릿은 wrangler.jsonc에 없어서 `wrangler types`로 만들지 않고 손으로 쓴다.
interface Env {
  MOLIT_SERVICE_KEY?: string;
  KAKAO_REST_API_KEY?: string;
  KAKAO_CLIENT_SECRET?: string;
  DB: D1Database;
  ASSETS: Fetcher;
}

const now = () => new Date();

/** `/api/*` 경로 표. 여기에 없는 `/api/*`는 JSON 404, 메서드가 없으면 405 */
const API_ROUTES: ApiRoute<Env>[] = [
  {
    path: "/api/apt-trades",
    methods: {
      GET: (request, env) => handleAptTrades(request, env, { fetch, now, cache: caches.default }),
    },
  },
  {
    path: "/api/shares",
    methods: { POST: (request, env) => createShare(request, env.DB, now) },
  },
  {
    path: "/api/shares/:token",
    methods: {
      GET: (_request, env, { token }) => getShare(token, env.DB, now),
      DELETE: (request, env, { token }) => revokeShare(request, token, env.DB),
    },
  },
  {
    path: "/api/auth/kakao/login",
    methods: { GET: (request, env) => startKakaoLogin(request, env) },
  },
  {
    path: "/api/auth/kakao/callback",
    methods: { GET: (request, env) => finishKakaoLogin(request, env, env.DB, { fetch, now }) },
  },
  {
    path: "/api/auth/logout",
    methods: { POST: (request, env) => logout(request, env.DB) },
  },
  {
    path: "/api/me",
    methods: { GET: (request, env) => getMe(request, env.DB, now) },
  },
  {
    path: "/api/listings",
    methods: {
      GET: (request, env) =>
        withSession(request, env.DB, now, (userId) => listListings(env.DB, userId)),
      POST: (request, env) =>
        withSession(request, env.DB, now, (userId) => createListing(request, env.DB, userId, now)),
    },
  },
  // `/api/listings/:id`보다 먼저 둔다(첫 번째로 맞는 경로를 쓴다).
  {
    path: "/api/listings/import",
    methods: {
      POST: (request, env) =>
        withSession(request, env.DB, now, (userId) => importListings(request, env.DB, userId)),
    },
  },
  {
    path: "/api/listings/:id",
    methods: {
      PUT: (request, env, { id }) =>
        withSession(request, env.DB, now, (userId) =>
          replaceListing(request, id, env.DB, userId, now),
        ),
      PATCH: (request, env, { id }) =>
        withSession(request, env.DB, now, (userId) =>
          updateListingFields(request, id, env.DB, userId, now),
        ),
      DELETE: (request, env, { id }) =>
        withSession(request, env.DB, now, (userId) => deleteListing(id, env.DB, userId)),
    },
  },
  {
    path: "/api/budget",
    methods: {
      GET: (request, env) =>
        withSession(request, env.DB, now, (userId) => getBudget(env.DB, userId)),
      PUT: (request, env) =>
        withSession(request, env.DB, now, (userId) => putBudget(request, env.DB, userId)),
    },
  },
  {
    path: "/api/budget/import",
    methods: {
      POST: (request, env) =>
        withSession(request, env.DB, now, (userId) => importBudget(request, env.DB, userId)),
    },
  },
  {
    path: "/api/listing-order",
    methods: {
      GET: (request, env) =>
        withSession(request, env.DB, now, (userId) => getListingOrder(env.DB, userId)),
      PUT: (request, env) =>
        withSession(request, env.DB, now, (userId) => putListingOrder(request, env.DB, userId)),
    },
  },
  {
    path: "/api/listing-order/import",
    methods: {
      POST: (request, env) =>
        withSession(request, env.DB, now, (userId) => importListingOrder(request, env.DB, userId)),
    },
  },
  {
    path: "/api/household/invites",
    methods: {
      POST: (request, env) =>
        withSession(request, env.DB, now, (userId) =>
          createHouseholdInvite(request, env.DB, userId, now),
        ),
      DELETE: (request, env) =>
        withSession(request, env.DB, now, (userId) => revokeHouseholdInvite(env.DB, userId)),
    },
  },
  {
    path: "/api/household/invites/:token",
    methods: { GET: (_request, env, { token }) => getHouseholdInvite(token, env.DB, now) },
  },
  {
    path: "/api/household/invites/:token/accept",
    methods: {
      POST: (request, env, { token }) =>
        withSession(request, env.DB, now, (userId) =>
          acceptHouseholdInvite(token, env.DB, userId, now),
        ),
    },
  },
  {
    path: "/api/household/leave",
    methods: {
      POST: (request, env) =>
        withSession(request, env.DB, now, (userId) => leaveHousehold(env.DB, userId)),
    },
  },
];

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return routeApi(request, env, API_ROUTES);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
