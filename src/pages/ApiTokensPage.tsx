import { Card, CardContent } from '@/components/ui/card';

export function ApiTokensPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">API Tokens</h2>
        <p className="text-sm text-[var(--agyn-gray)]">Issue and revoke platform API tokens.</p>
      </div>
      <Card className="border-[var(--agyn-border-subtle)]">
        <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
          Token issuance workflows will be available here.
        </CardContent>
      </Card>
    </div>
  );
}
