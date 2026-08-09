import { NavLink, useParams } from 'react-router-dom';
import { Code, ConnectError } from '@connectrpc/connect';
import { useQuery } from '@tanstack/react-query';
import { agentsClient, runnersClient } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EgressRuleAttachmentsTab } from '@/pages/detail-tabs/EgressRuleAttachmentsTab';
import { EnvironmentSubscriptionsTab } from '@/pages/detail-tabs/EnvironmentSubscriptionsTab';
import { EnvironmentVolumesTab } from '@/pages/detail-tabs/EnvironmentVolumesTab';
import { EnvironmentAvailability } from '@/gen/agynio/api/agents/v1/agents_pb';
import { DetailPageHeader } from '@/components/DetailPageHeader';
import { EnvsTab } from '@/pages/detail-tabs/EnvsTab';
import { InitScriptsTab } from '@/pages/detail-tabs/InitScriptsTab';
import { McpsTab } from '@/pages/detail-tabs/McpsTab';
import type { DetailTarget } from '@/pages/detail-tabs/target';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useImageRef } from '@/hooks/useImageRef';
import { EMPTY_PLACEHOLDER, formatTimestamp } from '@/lib/format';

export function EnvironmentDetailPage() {
  const { id: organizationIdParam, environmentId: environmentIdParam } = useParams();
  const organizationId = organizationIdParam ?? '';
  const environmentId = environmentIdParam ?? '';
  const imageRef = useImageRef(organizationId);

  const environmentQuery = useQuery({
    queryKey: ['environments', environmentId, 'detail'],
    queryFn: () => agentsClient.getEnvironment({ id: environmentId }),
    enabled: Boolean(environmentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const environment = environmentQuery.data?.environment ?? null;
  const isNotFoundError = environmentQuery.error instanceof ConnectError && environmentQuery.error.code === Code.NotFound;
  // getEnvironment resolves by id alone, so an id from another organization has
  // to be rejected here rather than rendered under this organization's route.
  const isOrgMismatch = Boolean(environment && organizationId && environment.organizationId !== organizationId);
  const isMissing = !environment && !environmentQuery.isPending && !environmentQuery.isError;
  const showNotFound = isNotFoundError || isOrgMismatch || isMissing;
  const showError = environmentQuery.isError && !isNotFoundError;

  useDocumentTitle(environment?.name ?? 'Environment');

  const runnerQuery = useQuery({
    queryKey: ['runners', environment?.runnerId ?? '', 'detail'],
    queryFn: () => runnersClient.getRunner({ id: environment?.runnerId ?? '' }),
    enabled: Boolean(environment?.runnerId) && !showNotFound,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const target: DetailTarget = { kind: 'environment', id: environmentId };
  const backHref = organizationId ? `/organizations/${organizationId}/environments` : '/organizations';
  const runnerName = runnerQuery.data?.runner?.name || environment?.runnerId || '';
  const runnerHref =
    organizationId && environment?.runnerId
      ? `/organizations/${organizationId}/runners/${environment.runnerId}`
      : '';

  return (
    <div className="space-y-6">
      {environmentQuery.isPending ? (
        <div className="text-sm text-muted-foreground">Loading environment...</div>
      ) : null}
      {showError ? <div className="text-sm text-muted-foreground">Failed to load environment.</div> : null}
      {showNotFound ? (
        <div className="text-sm text-muted-foreground" data-testid="environment-detail-not-found">
          Environment not found.
        </div>
      ) : null}
      {environment && !showNotFound ? (
        <>
        <DetailPageHeader
          parentLabel="Environments"
          parentHref={backHref}
          title={environment.name || 'Environment'}
          meta={[
            environment.runnerId ? runnerName : '',
            environment.flavor,
            imageRef(environment.workspaceImageId, environment.workspaceImageTag, environment.image),
          ]
            .filter(Boolean)
            .join(' · ')}
          badge={
            environment.availability ? (
              <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {EnvironmentAvailability[environment.availability]?.toLowerCase() ?? ''}
              </span>
            ) : null
          }
          testId="environment-detail-header"
        />
        <Tabs defaultValue="overview" data-testid="environment-detail-tabs" className="mt-6">
          <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger value="overview" data-testid="environment-detail-overview-tab" className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">
              Overview
            </TabsTrigger>
            <TabsTrigger value="volumes" data-testid="environment-detail-volumes-tab" className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">
              Volumes
            </TabsTrigger>
            <TabsTrigger value="mcps" data-testid="environment-detail-mcps-tab" className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">
              MCP Servers
            </TabsTrigger>
            <TabsTrigger value="init-scripts" data-testid="environment-detail-init-scripts-tab" className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">
              Init Scripts
            </TabsTrigger>
            <TabsTrigger value="envs" data-testid="environment-detail-envs-tab" className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">
              ENVs
            </TabsTrigger>
            <TabsTrigger value="egress-rules" data-testid="environment-detail-egress-rules-tab" className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">
              Egress Rules
            </TabsTrigger>
            <TabsTrigger value="subscriptions" data-testid="environment-detail-subscriptions-tab" className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">
              LLM
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Card className="border-border" data-testid="environment-detail-card">
              <CardContent className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Details</h3>
                  <p className="text-sm text-muted-foreground">
                    The images, runner and flavor workloads start with. Edit these from the Environments
                    list.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Name</div>
                    <div className="text-sm text-foreground" data-testid="environment-detail-name">
                      {environment.name || EMPTY_PLACEHOLDER}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Environment ID</div>
                    <div className="text-sm break-all text-foreground" data-testid="environment-detail-id">
                      {environment.meta?.id || EMPTY_PLACEHOLDER}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Workspace image</div>
                    <div className="text-sm break-all text-foreground" data-testid="environment-detail-image">
                      {imageRef(
                        environment.workspaceImageId,
                        environment.workspaceImageTag,
                        environment.image,
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Agent runtime image
                    </div>
                    <div
                      className="text-sm break-all text-foreground"
                      data-testid="environment-detail-agent-runtime-image"
                    >
                      {/* Empty makes this workspace-only: usable by a sandbox,
                          rejected when creating an agent. */}
                      {environment.agentRuntimeImageId
                        ? imageRef(environment.agentRuntimeImageId, environment.agentRuntimeImageTag)
                        : 'Not set — workspace only'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Runner</div>
                    <div className="text-sm text-foreground" data-testid="environment-detail-runner">
                      {runnerHref && runnerName ? (
                        <NavLink to={runnerHref} className="hover:underline">
                          {runnerName}
                        </NavLink>
                      ) : (
                        runnerName || EMPTY_PLACEHOLDER
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Flavor</div>
                    <div className="text-sm text-foreground" data-testid="environment-detail-flavor">
                      {environment.flavor || 'Runner default'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Created</div>
                    <div className="text-sm text-foreground" data-testid="environment-detail-created">
                      {formatTimestamp(environment.meta?.createdAt)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="volumes">
            <EnvironmentVolumesTab
              environmentId={environment.meta?.id ?? ''}
              runnerId={environment.runnerId ?? ''}
            />
          </TabsContent>
          <TabsContent value="mcps">
            <McpsTab target={target} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="init-scripts">
            <InitScriptsTab target={target} />
          </TabsContent>
          <TabsContent value="envs">
            <EnvsTab target={target} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="subscriptions">
            <EnvironmentSubscriptionsTab environment={environment} />
          </TabsContent>
          <TabsContent value="egress-rules">
            <EgressRuleAttachmentsTab target={target} organizationId={organizationId} />
          </TabsContent>
        </Tabs>
        </>
      ) : null}
    </div>
  );
}
