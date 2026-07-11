import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

// Generic, reusable error display — every error state in this app (network
// failure, validation failure, upstream AI failure) renders through this,
// optionally with a retry action (docs/12-ui-design.md §10: every error
// pairs a message with a concrete recovery action).
export function ErrorMessage({
  title = "Something went wrong",
  message,
  onRetry,
  className,
}: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-destructive">{title}</p>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
