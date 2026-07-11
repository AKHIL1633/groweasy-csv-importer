import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

// The one place page content width/centering is defined — every screen
// composes inside this instead of repeating max-width/padding utilities.
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-3xl px-4 py-8 sm:px-6", className)}>{children}</div>
  );
}
