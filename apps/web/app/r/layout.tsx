/**
 * Minimal layout for tokenized public report pages. No Clerk wrapping —
 * drivers don't have portal accounts and the link is the sole auth.
 */

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
