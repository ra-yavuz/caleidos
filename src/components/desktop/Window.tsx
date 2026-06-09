"use client";

import { motion, useDragControls } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { WindowEntry } from "@/types/window";

export function Window({
  entry,
  onClose,
  onFocus,
  children,
}: {
  entry: WindowEntry;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  children: ReactNode;
}) {
  const controls = useDragControls();

  return (
    <motion.div
      drag
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      initial={{ x: entry.pos.x, y: entry.pos.y, opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{ zIndex: entry.zIndex, width: entry.size.w, height: entry.size.h }}
      onPointerDown={() => onFocus(entry.id)}
      className="absolute left-0 top-0 flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl"
    >
      {/* title bar: the only drag handle */}
      <div
        onPointerDown={(e) => controls.start(e)}
        className="flex h-9 shrink-0 cursor-grab select-none items-center gap-2 border-b border-black/10 bg-neutral-100/80 px-3 backdrop-blur active:cursor-grabbing"
      >
        <button
          aria-label="close"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onClose(entry.id)}
          className="group flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500"
        >
          <X className="h-2.5 w-2.5 text-red-900/0 group-hover:text-red-900/70" />
        </button>
        <span className="h-3.5 w-3.5 rounded-full bg-yellow-400" />
        <span className="h-3.5 w-3.5 rounded-full bg-green-500" />
        <span className="ml-2 truncate text-xs font-medium text-neutral-600">
          {entry.title}
        </span>
      </div>

      {/* app content */}
      <div className="relative flex-1 overflow-hidden bg-white text-neutral-900">
        {children}
      </div>
    </motion.div>
  );
}
