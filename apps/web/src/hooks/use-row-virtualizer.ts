"use client";

import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { useRef, type RefObject } from "react";

interface RowVirtualizerResult {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  virtualRows: VirtualItem[];
  paddingTop: number;
  paddingBottom: number;
  measureElement: (node: Element | null) => void;
}

const DEFAULT_ROW_HEIGHT_PX = 37;
const DEFAULT_OVERSCAN = 8;

// Shared by ImportedRecordsTable and SkippedRecordsTable — both need
// identical "virtualize the rows inside an already-scrollable container"
// wiring, differing only in what each row renders. Renders every row (no
// row-count threshold/branch) when the list comfortably fits the
// container, so small result sets look and behave exactly as before
// virtualization existed — it only changes how many DOM rows exist, never
// what's visually shown.
export function useRowVirtualizer(rowCount: number): RowVirtualizerResult {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => DEFAULT_ROW_HEIGHT_PX,
    overscan: DEFAULT_OVERSCAN,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const firstRow = virtualRows[0];
  const lastRow = virtualRows[virtualRows.length - 1];
  const paddingTop = firstRow ? firstRow.start : 0;
  const paddingBottom = lastRow ? totalSize - lastRow.end : 0;

  return {
    scrollContainerRef,
    virtualRows,
    paddingTop,
    paddingBottom,
    measureElement: virtualizer.measureElement,
  };
}
