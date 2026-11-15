"use client";

import { MotionConfig } from "motion/react";

/**
 * Con «menos movimiento» en el sistema, Motion no desplaza ni escala nada: lo que entraba
 * deslizándose aparece con un fundido. Sin esto, el valor por defecto de Motion es ignorar la
 * preferencia, y casi toda la web se movía igual.
 */
export function Movimiento({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
