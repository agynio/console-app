import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { llmClient } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationModelsTab() {
  const { id } = useParams();
  const organizationId = id ?? '';

  const modelsQuery = useQuery({
    queryKey: ['llm', organizationId, 'models'],
    queryFn: () => llmClient.listModels({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const providersQuery = useQuery({
    queryKey: ['llm', organizationId, 'providers', 'models'],
    queryFn: () => llmClient.listLLMProviders({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const providerMap = useMemo(() => {
    const providers = providersQuery.data?.providers ?? [];
    return new Map(
      providers.flatMap((provider) => {
        const providerId = provider.meta?.id;
        return providerId ? ([[providerId, provider]] as const) : [];
      }),
    );
  }, [providersQuery.data?.providers]);

  const models = modelsQuery.data?.models ?? [];
  const isLoading = modelsQuery.isPending || providersQuery.isPending;
  const isError = modelsQuery.isError || providersQuery.isError;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="organization-models-heading">
          Models
        </h3>
        <p className="text-sm text-[var(--agyn-gray)]">Models available in this organization.</p>
      </div>
      {isLoading ? <div className="text-sm text-[var(--agyn-gray)]">Loading models...</div> : null}
      {isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load models.</div> : null}
      {models.length === 0 && !isLoading ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-models-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">No models found.</CardContent>
        </Card>
      ) : null}
      {models.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-models-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr_1fr]"
              data-testid="organization-models-header"
            >
              <span>Model</span>
              <span>Provider</span>
              <span>Remote Name</span>
              <span>Created</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {models.map((model) => {
                const provider = providerMap.get(model.llmProviderId);
                return (
                  <div
                    key={model.meta?.id ?? model.name}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr_1fr]"
                    data-testid="organization-model-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="organization-model-name">
                        {model.name}
                      </div>
                      <div className="text-xs text-[var(--agyn-gray)]" data-testid="organization-model-id">
                        {model.meta?.id ?? '—'}
                      </div>
                    </div>
                    <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-model-provider">
                      {provider?.endpoint ?? (model.llmProviderId || '—')}
                    </span>
                    <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-model-remote">
                      {model.remoteName || '—'}
                    </span>
                    <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-model-created">
                      {formatDateOnly(model.meta?.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
