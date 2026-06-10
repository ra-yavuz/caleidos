"use client";

// Renders a surface's icon, which the model returns as EITHER an emoji or an
// inline <svg> string. SVG is injected (it is model-generated markup, but it is
// static SVG rendered inert in a div, not executed); emoji renders as text. A
// generic fallback glyph is shown when no icon is set yet.
export function Icon({ icon, className }: { icon?: string | null; className?: string }) {
  const cls = className ?? "h-6 w-6";
  if (!icon) {
    return (
      <span className={cls} aria-hidden>
        <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="4" />
        </svg>
      </span>
    );
  }
  const trimmed = icon.trim();
  if (trimmed.startsWith("<svg")) {
    return (
      <span
        className={`${cls} inline-flex items-center justify-center [&>svg]:h-full [&>svg]:w-full`}
        aria-hidden
        // SVG only; the surrounding sandbox/escaping prevents script execution,
        // and these icons come from the same generation path as components.
        dangerouslySetInnerHTML={{ __html: trimmed }}
      />
    );
  }
  // emoji or short text
  return (
    <span className={`${cls} inline-flex items-center justify-center`} aria-hidden style={{ fontSize: "1.25rem", lineHeight: 1 }}>
      {trimmed.slice(0, 4)}
    </span>
  );
}
