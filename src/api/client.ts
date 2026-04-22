import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { authInterceptor } from '@/auth';
import { config } from '@/config';
import { AgentsGateway } from '@/gen/agynio/api/gateway/v1/agents_pb';
import { AppsGateway } from '@/gen/agynio/api/gateway/v1/apps_pb';
import { FilesGateway } from '@/gen/agynio/api/gateway/v1/files_pb';
import { LLMGateway } from '@/gen/agynio/api/gateway/v1/llm_pb';
import { MeteringGateway } from '@/gen/agynio/api/gateway/v1/metering_pb';
import { NotificationsGateway } from '@/gen/agynio/api/gateway/v1/notifications_pb';
import { OrganizationsGateway } from '@/gen/agynio/api/gateway/v1/organizations_pb';
import { RunnersGateway } from '@/gen/agynio/api/gateway/v1/runners_pb';
import { SecretsGateway } from '@/gen/agynio/api/gateway/v1/secrets_pb';
import { ThreadsGateway } from '@/gen/agynio/api/gateway/v1/threads_pb';
import { UsersGateway } from '@/gen/agynio/api/gateway/v1/users_pb';
import { RunnersService } from '@/gen/agynio/api/runners/v1/runners_pb';

const transport = createConnectTransport({
  baseUrl: config.apiBaseUrl,
  interceptors: [authInterceptor],
});

export const usersClient = createClient(UsersGateway, transport);
export const agentsClient = createClient(AgentsGateway, transport);
export const appsClient = createClient(AppsGateway, transport);
export const llmClient = createClient(LLMGateway, transport);
export const meteringClient = createClient(MeteringGateway, transport);
export const organizationsClient = createClient(OrganizationsGateway, transport);
const runnersGatewayGetVolume = { ...RunnersService.method.getVolume, parent: RunnersGateway };
const runnersGatewayListVolumes = { ...RunnersService.method.listVolumes, parent: RunnersGateway };
const runnersGatewayListVolumesByThread = {
  ...RunnersService.method.listVolumesByThread,
  parent: RunnersGateway,
};
const runnersGatewayWithVolumes = {
  ...RunnersGateway,
  methods: [
    ...RunnersGateway.methods,
    runnersGatewayGetVolume,
    runnersGatewayListVolumes,
    runnersGatewayListVolumesByThread,
  ],
  method: {
    ...RunnersGateway.method,
    getVolume: runnersGatewayGetVolume,
    listVolumes: runnersGatewayListVolumes,
    listVolumesByThread: runnersGatewayListVolumesByThread,
  },
};
export const runnersClient = createClient(runnersGatewayWithVolumes, transport);
export const secretsClient = createClient(SecretsGateway, transport);
export const notificationsClient = createClient(NotificationsGateway, transport);
export const threadsClient = createClient(ThreadsGateway, transport);
export const filesClient = createClient(FilesGateway, transport);
