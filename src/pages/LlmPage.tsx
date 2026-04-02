import { Card, CardContent } from '@/components/ui/card';

export function LlmPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">LLM Providers & Models</h2>
        <p className="text-sm text-[var(--agyn-gray)]">Configure providers, models, and routing rules.</p>
      </div>
      <Card className="border-[var(--agyn-border-subtle)]">
        <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
          Provider and model configuration is coming soon.
        </CardContent>
      </Card>
    </div>
  );
}
