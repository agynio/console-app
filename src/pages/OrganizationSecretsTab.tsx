import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { secretsClient } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { SecretProviderType } from '@/gen/agynio/api/secrets/v1/secrets_pb';

function formatProviderType(type: SecretProviderType): string {
  if (type === SecretProviderType.VAULT) return 'Vault';
  return 'Unspecified';
}

export function OrganizationSecretsTab() {
  const { id } = useParams();
  const organizationId = id ?? '';

  const providersQuery = useQuery({
    queryKey: ['secrets', organizationId, 'providers'],
    queryFn: () => secretsClient.listSecretProviders({ organizationId, pageSize: 200, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const secretsQuery = useQuery({
    queryKey: ['secrets', organizationId, 'list'],
    queryFn: () =>
      secretsClient.listSecrets({
        organizationId,
        pageSize: 200,
        pageToken: '',
        secretProviderId: '',
      }),
    enabled: Boolean(organizationId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const providerMap = useMemo(
    () => new Map((providersQuery.data?.secretProviders ?? []).map((provider) => [provider.meta?.id ?? '', provider])),
    [providersQuery.data?.secretProviders],
  );

  const isLoading = providersQuery.isPending || secretsQuery.isPending;
  const isError = providersQuery.isError || secretsQuery.isError;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-[var(--agyn-dark)]">Secrets</h3>
        <p className="text-sm text-[var(--agyn-gray)]">Secret providers and secrets.</p>
      </div>
      {isLoading ? <div className="text-sm text-[var(--agyn-gray)]">Loading secrets...</div> : null}
      {isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load secrets.</div> : null}

      <Card className="border-[var(--agyn-border-subtle)]">
        <CardContent className="px-0">
          <div className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)]">
            Secret Providers
          </div>
          <div className="divide-y divide-[var(--agyn-border-subtle)]">
            {(providersQuery.data?.secretProviders ?? []).length === 0 ? (
              <div className="px-6 py-6 text-sm text-[var(--agyn-gray)]">No secret providers configured.</div>
            ) : (
              providersQuery.data?.secretProviders.map((provider) => (
                <div key={provider.meta?.id ?? provider.title} className="px-6 py-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--agyn-dark)]">{provider.title}</span>
                    <Badge variant="secondary">{formatProviderType(provider.type)}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-[var(--agyn-gray)]">{provider.description}</div>
                  {provider.config?.provider.case === 'vault' ? (
                    <div className="mt-2 text-xs text-[var(--agyn-gray)]">
                      Vault address: {provider.config.provider.value.address || '—'}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[var(--agyn-border-subtle)]">
        <CardContent className="px-0">
          <div className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)]">Secrets</div>
          <div className="divide-y divide-[var(--agyn-border-subtle)]">
            {(secretsQuery.data?.secrets ?? []).length === 0 ? (
              <div className="px-6 py-6 text-sm text-[var(--agyn-gray)]">No secrets configured.</div>
            ) : (
              secretsQuery.data?.secrets.map((secret) => {
                const provider = providerMap.get(secret.secretProviderId);
                return (
                  <div key={secret.meta?.id ?? secret.title} className="px-6 py-4 text-sm">
                    <div className="font-medium text-[var(--agyn-dark)]">{secret.title}</div>
                    <div className="mt-1 text-xs text-[var(--agyn-gray)]">{secret.description}</div>
                    <div className="mt-2 text-xs text-[var(--agyn-gray)]">
                      Provider: {provider?.title ?? secret.secretProviderId}
                    </div>
                    <div className="text-xs text-[var(--agyn-gray)]">Remote name: {secret.remoteName}</div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
