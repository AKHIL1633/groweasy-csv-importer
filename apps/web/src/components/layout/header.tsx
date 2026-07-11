import { PageContainer } from "@/components/layout/page-container";
import { ThemeToggle } from "@/components/layout/theme-toggle";

// Static branding only — no nav, no account chrome (docs/12-ui-design.md
// §2: this is a focused single-page tool, not a dashboard). ThemeToggle is
// the one interactive exception, kept minimal (a single icon button).
export function Header() {
  return (
    <header className="border-b">
      <PageContainer className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-lg font-semibold">GrowEasy CSV Importer</h1>
          <p className="text-sm text-muted-foreground">Import leads from any CSV layout.</p>
        </div>
        <ThemeToggle />
      </PageContainer>
    </header>
  );
}
