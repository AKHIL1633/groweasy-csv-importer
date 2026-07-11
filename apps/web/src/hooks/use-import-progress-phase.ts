"use client";

import { useEffect, useState } from "react";

// The backend returns a single buffered response (docs/07-ai-design.md §5's
// MVP) — there is no real per-phase signal from the server. This list is
// therefore not a progress percentage or a time estimate: it's the *real*,
// fixed pipeline order (upload -> parse -> validate -> batch -> AI ->
// build), advanced on a timer and then held indefinitely on the one phase
// that genuinely dominates the wait, until the request actually resolves.
export const IMPORT_PROGRESS_PHASES = [
  "Uploading CSV…",
  "Parsing CSV…",
  "Validating CSV…",
  "Preparing AI batches…",
  "Processing with AI…",
  "Building results…",
] as const;

// "Processing with AI…" — the only phase with a genuinely unknown, often
// multi-second duration. Every phase before it is fast enough in practice
// (see backend logs: parse/validate/batch-prep complete within
// milliseconds) that ticking through them quickly is honest, not misleading.
const HOLD_AT_PHASE_INDEX = IMPORT_PROGRESS_PHASES.length - 2;
const PHASE_DWELL_MS = 450;

// If the backend later adds real batch-progress events, swap this hook's
// return value for a phase index derived from those events instead —
// ImportProgressIndicator only ever consumes a phase index, so it needs no
// change to become event-driven.
export function useImportProgressPhase(active: boolean): number {
  const [phaseIndex, setPhaseIndex] = useState(0);

  // "Reset state when a prop changes" is adjusted during render itself
  // (React's documented pattern for this exact case) rather than via a
  // synchronous setState at the top of an effect — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setPhaseIndex(0);
  }

  useEffect(() => {
    if (!active) return;

    let current = 0;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    function scheduleNext() {
      if (current >= HOLD_AT_PHASE_INDEX) return;
      const timeout = setTimeout(() => {
        current += 1;
        setPhaseIndex(current);
        scheduleNext();
      }, PHASE_DWELL_MS);
      timeouts.push(timeout);
    }

    scheduleNext();

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [active]);

  return phaseIndex;
}
