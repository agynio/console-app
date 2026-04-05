import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationVolumesTab() {
  const { id } = useParams();
  const organizationId = id ?? '';

  const volumesQuery = useQuery({
    queryKey: ['volumes', organizationId, 'list'],
    queryFn: () => agentsClient.listVolumes({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const volumes = volumesQuery.data?.volumes ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="organization-volumes-heading">
          Volumes
        </h3>
        <p className="text-sm text-[var(--agyn-gray)]">Storage volumes for this organization.</p>
      </div>
      {volumesQuery.isPending ? <div className="text-sm text-[var(--agyn-gray)]">Loading volumes...</div> : null}
      {volumesQuery.isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load volumes.</div> : null}
      {volumes.length === 0 && !volumesQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-volumes-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No volumes provisioned.
          </CardContent>
        </Card>
      ) : null}
      {volumes.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-volumes-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr_1fr]"
              data-testid="organization-volumes-header"
            >
              <span>Volume</span>
              <span>Mount Path</span>
              <span>Size</span>
              <span>Persistent</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {volumes.map((volume) => (
                <div
                  key={volume.meta?.id ?? volume.mountPath}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr_1fr]"
                  data-testid="organization-volume-row"
                >
                  <div>
                    <div className="font-medium" data-testid="organization-volume-description">
                      {volume.description || 'Volume'}
                    </div>
                    <div className="text-xs text-[var(--agyn-gray)]" data-testid="organization-volume-id">
                      {volume.meta?.id ?? '—'}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-volume-mount">
                    {volume.mountPath || '—'}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-volume-size">
                    {volume.size || '—'}
                  </span>
                  <Badge
                    variant={volume.persistent ? 'secondary' : 'outline'}
                    data-testid="organization-volume-persistent"
                  >
                    {volume.persistent ? 'Yes' : 'No'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
