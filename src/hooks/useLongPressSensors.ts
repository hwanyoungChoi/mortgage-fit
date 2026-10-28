import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import { KEYBOARD_CODES, LONG_PRESS } from "@/lib/constants/dragReorder";

/** 끌어 옮기기 센서 묶음: 마우스·터치는 꾹 누르기(`LONG_PRESS`), 키보드는 스페이스로 들고 화살표로 옮긴다(ADR-026) */
export function useLongPressSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: LONG_PRESS }),
    useSensor(TouchSensor, { activationConstraint: LONG_PRESS }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: KEYBOARD_CODES,
    }),
  );
}
