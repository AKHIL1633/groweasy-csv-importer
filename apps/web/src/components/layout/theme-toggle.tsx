"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const THEME_SEQUENCE = ["light", "dark", "system"] as const;

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

function noopSubscribe() {
  return () => {};
}

// The standard effect-free way to know "has this component hydrated on the
// client yet" — true only once the client has actually rendered, false
// during SSR and the first client render, matching what getServerSnapshot
// returns. theme is undefined until next-themes hydrates client-side;
// rendering a neutral placeholder until then avoids a mismatched icon flash
// (the <html> class itself never mismatches — see next-themes' own script —
// only this component's icon choice would).
function useHasMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

// next-themes persists the choice (localStorage) and resolves "system" via
// prefers-color-scheme itself — this component only needs to cycle through
// the three states and render the icon for the current one.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useHasMounted();

  const current = mounted ? ((theme ?? "system") as (typeof THEME_SEQUENCE)[number]) : "system";
  const Icon = THEME_ICONS[current];

  function cycleTheme() {
    const nextIndex = (THEME_SEQUENCE.indexOf(current) + 1) % THEME_SEQUENCE.length;
    setTheme(THEME_SEQUENCE[nextIndex] ?? "system");
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      aria-label={`Theme: ${current}. Click to change.`}
      title={`Theme: ${current}`}
    >
      {mounted ? <Icon className="size-4" aria-hidden="true" /> : null}
    </Button>
  );
}
