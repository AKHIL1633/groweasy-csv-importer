"use client";

import { FileUp } from "lucide-react";
import { useId, useState, type ChangeEvent, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

interface CsvFileInputProps {
  file: File | null;
  onFileSelected: (file: File) => void;
  onFileCleared: () => void;
  onInvalidFile?: (reason: string) => void;
  disabled?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Same rule as the input's own accept=".csv,text/csv" — the native accept
// attribute filters the OS file picker (click path) but is never enforced
// on a raw drag-and-drop, so drop needs this explicit check to reject a
// non-CSV file with the same effective rule the click path already gets.
function isCsvFile(candidate: File): boolean {
  return candidate.name.toLowerCase().endsWith(".csv") || candidate.type === "text/csv";
}

// Client-side *content* validation is deliberately not duplicated here —
// the backend (already built) is the authoritative validator for anything
// beyond "is this even a CSV file." The accept attribute is a soft nudge
// for the click path; isCsvFile is its drag-and-drop equivalent.
export function CsvFileInput({
  file,
  onFileSelected,
  onFileCleared,
  onInvalidFile,
  disabled,
}: CsvFileInputProps) {
  const inputId = useId();
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) {
      onFileSelected(selected);
    }
    // Reset so selecting the same filename again still fires onChange.
    event.target.value = "";
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    setIsDraggingOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    // dragleave also fires when moving between child elements of the
    // dropzone — only reset once the pointer has actually left the zone
    // itself, or drag-over highlighting flickers while crossing children.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDraggingOver(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
    if (disabled) return;

    const dropped = event.dataTransfer.files[0];
    if (!dropped) return;

    if (!isCsvFile(dropped)) {
      onInvalidFile?.(`"${dropped.name}" doesn't look like a CSV file. Please drop a .csv file.`);
      return;
    }

    onFileSelected(dropped);
  }

  return (
    <div
      data-testid="csv-dropzone"
      className={cn(
        "flex flex-col gap-3 rounded-lg border-2 border-dashed p-4 transition-colors",
        isDraggingOver ? "border-primary bg-accent" : "border-transparent",
      )}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium">
          Upload CSV file
        </label>
        <Input
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          onChange={handleChange}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Drag & drop a CSV file here, or use the button above.
        </p>
      </div>

      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium">{file.name}</p>
            <p className="text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onFileCleared}
            disabled={disabled}
          >
            Remove
          </Button>
        </div>
      ) : (
        <EmptyState
          icon={<FileUp className="size-6 text-muted-foreground" aria-hidden="true" />}
          title="No file selected"
          description="Choose a CSV file, or drag one in from your file explorer."
        />
      )}
    </div>
  );
}
