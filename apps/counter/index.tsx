"use client";
import { useState } from "react";
import { Plus, Minus } from "lucide-react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="w-full h-full overflow-auto flex flex-col items-center justify-center gap-8 p-6 bg-neutral-950 text-white select-none">
      <div className="text-8xl font-bold tabular-nums tracking-tight">
        {count}
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={() => setCount((c) => c - 1)}
          className="w-16 h-16 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition"
          aria-label="Decrement"
        >
          <Minus className="w-8 h-8" />
        </button>
        <button
          onClick={() => setCount((c) => c + 1)}
          className="w-16 h-16 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 active:scale-95 transition"
          aria-label="Increment"
        >
          <Plus className="w-8 h-8" />
        </button>
      </div>
    </div>
  );
}
