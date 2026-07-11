import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
}

// Generic "nothing here" display — used for genuinely empty results, not
// error states (see ErrorMessage for that).
export function EmptyState({ title, description, icon, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 py-10 text-center", className)}>
      {icon ?? <Inbox className="size-6 text-muted-foreground" aria-hidden="true" />}
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
