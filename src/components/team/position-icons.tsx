"use client";

import { Camera, Code, Confetti, Cube, Headset, ShieldCheck, UsersThree } from "@phosphor-icons/react/ssr";

const ICONS = { headset: Headset, shield: ShieldCheck, code: Code, camera: Camera, cube: Cube, confetti: Confetti, users: UsersThree };
export const POSITION_ICON_KEYS_CLIENT = Object.keys(ICONS) as (keyof typeof ICONS)[];

export function PositionIconClient({ icon }: { icon: string }) {
  const I = ICONS[icon as keyof typeof ICONS] ?? UsersThree;
  return <I size={20} weight="duotone" aria-hidden />;
}
