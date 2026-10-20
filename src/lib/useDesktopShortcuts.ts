import { useEffect, useCallback } from "react";

export type ShortcutAction =
  | "goto-attendance"
  | "goto-fees"
  | "goto-communication"
  | "print";

type ShortcutMap = Record<ShortcutAction, (e: KeyboardEvent) => void>;

function isMod(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey;
}

export function useDesktopShortcuts(handlers: Partial<ShortcutMap>) {
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Ctrl+P (print) works even in fields — it's a system-level action
      if (isMod(e) && !e.shiftKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        handlers["print"]?.(e);
        return;
      }

      // Ctrl+Shift+ combos — skip while typing to avoid hijacking text entry
      if (typing) return;
      if (!isMod(e) || !e.shiftKey) return;

      const key = e.key.toLowerCase();
      if (key === "a") {
        e.preventDefault();
        handlers["goto-attendance"]?.(e);
      } else if (key === "f") {
        e.preventDefault();
        handlers["goto-fees"]?.(e);
      } else if (key === "m") {
        e.preventDefault();
        handlers["goto-communication"]?.(e);
      }
    },
    [handlers],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onKey]);
}
