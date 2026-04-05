import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { authInterceptor } from '@/auth';
import { config } from '@/config';
import { AgentsGateway } from '@/gen/agynio/api/gateway/v1/agents_pb';
import { AppsGateway } from '@/gen/agynio/api/gateway/v1/apps_pb';
import { LLMGateway } from '@/gen/agynio/api/gateway/v1/llm_pb';
import { OrganizationsGateway } from '@/gen/agynio/api/gateway/v1/organizations_pb';
import { RunnersGateway } from '@/gen/agynio/api/gateway/v1/runners_pb';
import { SecretsGateway } from '@/gen/agynio/api/gateway/v1/secrets_pb';
import { UsersGateway } from '@/gen/agynio/api/gateway/v1/users_pb';
import type { ListAppsRequest } from '@/gen/agynio/api/apps/v1/apps_pb';

const transport = createConnectTransport({
  baseUrl: config.apiBaseUrl,
  interceptors: [authInterceptor],
});

export const usersClient = createClient(UsersGateway, transport);
export const agentsClient = createClient(AgentsGateway, transport);
const appsServiceClient = createClient(AppsGateway, transport);
type ListInstallationsRequest = Omit<ListAppsRequest, '$typeName'> & { organizationId: string };
type AppsClient = typeof appsServiceClient & {
  listInstallations: (request: ListInstallationsRequest) => ReturnType<typeof appsServiceClient.listApps>;
};
export const appsClient: AppsClient = Object.assign(appsServiceClient, {
  listInstallations: ({ organizationId: _organizationId, ...request }: ListInstallationsRequest) =>
    appsServiceClient.listApps(request),
});
export const llmClient = createClient(LLMGateway, transport);
export const organizationsClient = createClient(OrganizationsGateway, transport);
export const runnersClient = createClient(RunnersGateway, transport);
export const secretsClient = createClient(SecretsGateway, transport);
