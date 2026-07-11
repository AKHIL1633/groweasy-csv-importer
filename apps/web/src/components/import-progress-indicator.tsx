import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportProgressIndicatorProps {
  phases: readonly string[];
  currentPhaseIndex: number;
  className?: string;
}

// Deliberately not a percentage bar: the dot row marks ordinal position in
// a known, fixed sequence, not a proportional time estimate (see
// use-import-progress-phase.ts for why nothing here can be time-accurate).
// The changing phase label is intentionally NOT part of the live region —
// re-announcing it every ~450ms would spam screen reader users; they get
// one stable "please wait" status instead, matching LoadingSpinner's
// existing simple announcement pattern.
export function ImportProgressIndicator({
  phases,
  currentPhaseIndex,
  className,
}: ImportProgressIndicatorProps) {
  const currentLabel = phases[currentPhaseIndex] ?? phases[phases.length - 1];

  return (
    <div className={cn("flex flex-col items-center gap-2 py-1", className)}>
      <span role="status" className="sr-only">
        Importing your file, please wait.
      </span>
      <div
        className="flex items-center gap-2 text-sm font-medium text-foreground"
        aria-hidden="true"
      >
        <Loader2 className="size-4 animate-spin" />
        <span>{currentLabel}</span>
      </div>
      <div className="flex items-center gap-1" aria-hidden="true">
        {phases.map((phase, index) => (
          <span
            key={phase}
            className={cn(
              "h-1.5 w-5 rounded-full transition-colors duration-200",
              index <= currentPhaseIndex ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
    </div>
  );
}
