import type { Active } from "@dnd-kit/core";

/** 우리 집 목록에서 드는 것: 줄 하나 또는 묶음(구분) 통째 */
export type LineDragKind = "line" | "group";

/** 묶음의 끌기 id. 줄 key(`item.id:quote.id`)에는 `/`가 없어(id는 영문·숫자·`_-`) 겹치지 않는다 */
export const groupDragIdOf = (trade: string) => `group/${trade}`;

/** 든 것의 종류. 묶음은 `useSortable`의 data로 표시하고, 나머지는 줄이다 */
export function dragKindOf(active: Pick<Active, "data">): LineDragKind {
  return active.data.current?.kind === "group" ? "group" : "line";
}
