import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { llmClient } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { formatAuthMethod, formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationLlmProvidersTab() {
  const { id } = useParams();
  const organizationId = id ?? '';

  const providersQuery = useQuery({
    queryKey: ['llm', organizationId, 'providers'],
    queryFn: () => llmClient.listLLMProviders({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const providers = providersQuery.data?.providers ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3
          className="text-lg font-semibold text-[var(--agyn-dark)]"
          data-testid="organization-llm-providers-heading"
        >
          LLM Providers
        </h3>
        <p className="text-sm text-[var(--agyn-gray)]">Provider endpoints configured for this organization.</p>
      </div>
      {providersQuery.isPending ? (
        <div className="text-sm text-[var(--agyn-gray)]">Loading providers...</div>
      ) : null}
      {providersQuery.isError ? (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load providers.</div>
      ) : null}
      {providers.length === 0 && !providersQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-llm-providers-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No providers configured.
          </CardContent>
        </Card>
      ) : null}
      {providers.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-llm-providers-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr]"
              data-testid="organization-llm-providers-header"
            >
              <span>Provider</span>
              <span>Auth Method</span>
              <span>Created</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {providers.map((provider) => (
                <div
                  key={provider.meta?.id ?? provider.endpoint}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr]"
                  data-testid="organization-llm-provider-row"
                >
                  <div>
                    <div className="font-medium" data-testid="organization-llm-provider-endpoint">
                      {provider.endpoint}
                    </div>
                    <div className="text-xs text-[var(--agyn-gray)]" data-testid="organization-llm-provider-id">
                      {provider.meta?.id ?? '—'}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-llm-provider-auth">
                    {formatAuthMethod(provider.authMethod)}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-llm-provider-created">
                    {formatDateOnly(provider.meta?.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
