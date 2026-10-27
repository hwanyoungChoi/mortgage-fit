/** localStorage 쓰기 결과. throw(시크릿 모드, 용량 초과)는 `unavailable`이다. */
export type StorageWriteResult = { ok: true } | { ok: false; reason: "unavailable" };

/** 첫 로그인 이전을 끝낸 사용자 id 기록(예산·직접 정렬 순서). 기록은 최선으로 한다. */
export type UserIdRecordStore = {
  /** 읽지 못하거나 형식이 어긋나면 기록 없음이다. */
  has: (userId: string) => boolean;
  add: (userId: string) => void;
};

/** 사용자별 id 목록(이 기기에서 그 계정으로 옮긴 매물·인테리어 계획 id). 키 하나에 `Record<userId, id[]>`로 둔다. */
export type IdsByUser = Record<string, string[]>;

export type IdsByUserStore = {
  /** 읽지 못하거나 형식이 어긋나면 빈 기록이다. */
  read: () => IdsByUser;
  /** 그 사용자의 기록에 id를 더한다. 빈 배열이면 기록 키만 만든다(이 계정의 첫 이전을 정했다는 뜻). */
  add: (userId: string, ids: string[]) => void;
};
