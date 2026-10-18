import React from 'react';
import type { PanInfo } from 'motion/react';

interface SheetHandleProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  dark?: boolean;
}

// Grab bar of a mobile bottom sheet: dragging it down closes the sheet
export const SheetHandle: React.FC<SheetHandleProps> = ({ onPointerDown, dark = false }) => (
  <div
    onPointerDown={onPointerDown}
    className="sm:hidden flex justify-center -mt-2 pt-1 pb-3 touch-none cursor-grab active:cursor-grabbing"
    aria-hidden="true"
  >
    <span className={`w-9 h-[5px] rounded-full ${dark ? 'bg-slate-600' : 'bg-line-3'}`} />
  </div>
);

export function shouldCloseSheet(info: PanInfo): boolean {
  return info.offset.y > 110 || info.velocity.y > 600;
}
