"use client";

import { API_ROUTES, importResultSchema, type ImportResult } from "@groweasy/shared";
import { useReducer, useState } from "react";
import { toast } from "sonner";
import { CsvFileInput } from "@/components/upload/csv-file-input";
import { ImportResults } from "@/components/results/import-results";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/error-message";
import { ImportProgressIndicator } from "@/components/import-progress-indicator";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { IMPORT_PROGRESS_PHASES, useImportProgressPhase } from "@/hooks/use-import-progress-phase";

// File selection and the import request lifecycle are genuinely different
// kinds of state: which file is chosen is simple, ephemeral UI state with
// no interesting transitions, while idle -> loading -> success/error are
// real, named, mutually exclusive states worth a reducer. Merging them
// would just make every file change also reason about request status.
type ImportRequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: ImportResult }
  | { status: "error"; message: string };

type ImportRequestAction =
  | { type: "start" }
  | { type: "success"; result: ImportResult }
  | { type: "error"; message: string }
  | { type: "reset" };

function importRequestReducer(
  _state: ImportRequestState,
  action: ImportRequestAction,
): ImportRequestState {
  switch (action.type) {
    case "start":
      return { status: "loading" };
    case "success":
      return { status: "success", result: action.result };
    case "error":
      return { status: "error", message: action.message };
    case "reset":
      return { status: "idle" };
  }
}

export function ImportWorkflow() {
  const [file, setFile] = useState<File | null>(null);
  const [requestState, dispatch] = useReducer(importRequestReducer, { status: "idle" });

  const isLoading = requestState.status === "loading";
  const progressPhaseIndex = useImportProgressPhase(isLoading);

  function handleFileSelected(selected: File) {
    setFile(selected);
    dispatch({ type: "reset" });
  }

  function handleFileCleared() {
    setFile(null);
    dispatch({ type: "reset" });
  }

  function handleInvalidFile(reason: string) {
    toast.error(reason);
  }

  function handleReset() {
    setFile(null);
    dispatch({ type: "reset" });
  }

  async function handleImport() {
    if (!file || isLoading) {
      return;
    }

    dispatch({ type: "start" });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const result = await apiClient.postFormData(API_ROUTES.IMPORTS, importResultSchema, formData);
      dispatch({ type: "success", result });
      toast.success(
        `Imported ${result.summary.totalImported} of ${result.summary.totalRows} leads.`,
      );
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Something went wrong.";
      dispatch({ type: "error", message });
      toast.error(message);
    }
  }

  if (requestState.status === "success") {
    return <ImportResults result={requestState.result} onReset={handleReset} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <CsvFileInput
        file={file}
        onFileSelected={handleFileSelected}
        onFileCleared={handleFileCleared}
        onInvalidFile={handleInvalidFile}
        disabled={isLoading}
      />

      {requestState.status === "error" ? (
        <ErrorMessage message={requestState.message} onRetry={handleImport} />
      ) : null}

      {isLoading ? (
        <ImportProgressIndicator
          phases={IMPORT_PROGRESS_PHASES}
          currentPhaseIndex={progressPhaseIndex}
        />
      ) : (
        <Button type="button" onClick={handleImport} disabled={!file}>
          Import
        </Button>
      )}
    </div>
  );
}
