import type { Page } from '@playwright/test';

const USERS_GATEWAY_PATH = '/api/agynio.api.gateway.v1.UsersGateway';
const ORGS_GATEWAY_PATH = '/api/agynio.api.gateway.v1.OrganizationsGateway';
const SECRETS_GATEWAY_PATH = '/api/agynio.api.gateway.v1.SecretsGateway';
const RUNNERS_GATEWAY_PATH = '/api/agynio.api.gateway.v1.RunnersGateway';

const CONNECT_HEADERS = {
  'Content-Type': 'application/json',
  'Connect-Protocol-Version': '1',
};

type OrganizationWire = {
  id: string;
  name: string;
};

type UserWire = {
  meta?: { id?: string };
  email?: string;
  name?: string;
  nickname?: string;
};

type MembershipWire = {
  id?: string;
  identityId?: string;
  role?: string | number;
  status?: string | number;
};

type RunnerWire = {
  meta?: { id?: string };
  name?: string;
  labels?: Record<string, string>;
  status?: string | number;
};

type CreateOrganizationResponseWire = {
  organization?: { id?: string };
};

type ListAccessibleOrganizationsResponseWire = {
  organizations?: OrganizationWire[];
};

type CreateUserResponseWire = {
  user?: { meta?: { id?: string } };
};

type UpdateUserResponseWire = {
  user?: { meta?: { id?: string } };
};

type ListUsersResponseWire = {
  users?: UserWire[];
};

type GetMeResponseWire = {
  user?: UserWire;
  clusterRole?: string | number;
};

type CreateMembershipResponseWire = {
  membership?: MembershipWire;
};

type ListMembersResponseWire = {
  memberships?: MembershipWire[];
};

type UpdateMembershipRoleResponseWire = {
  membership?: MembershipWire;
};

type ClusterRoleWire = string | number | undefined;

type CreateSecretProviderResponseWire = {
  secretProvider?: { meta?: { id?: string } };
};

type ListSecretProvidersResponseWire = {
  secretProviders?: Array<{ meta?: { id?: string }; title?: string }>;
};

type CreateSecretResponseWire = {
  secret?: { meta?: { id?: string } };
};

type ListRunnersResponseWire = {
  runners?: RunnerWire[];
};

type GetRunnerResponseWire = {
  runner?: RunnerWire;
};

type MembershipRoleValue = 'MEMBERSHIP_ROLE_UNSPECIFIED' | 'MEMBERSHIP_ROLE_OWNER' | 'MEMBERSHIP_ROLE_MEMBER';
type MembershipStatusValue =
  | 'MEMBERSHIP_STATUS_UNSPECIFIED'
  | 'MEMBERSHIP_STATUS_PENDING'
  | 'MEMBERSHIP_STATUS_ACTIVE';

function resolveBaseUrl(): string {
  const baseUrl = process.env.E2E_BASE_URL;
  if (!baseUrl) {
    throw new Error('E2E_BASE_URL is required to run e2e tests.');
  }
  return baseUrl;
}

function buildRpcUrl(servicePath: string, method: string): string {
  return new URL(`${servicePath}/${method}`, resolveBaseUrl()).toString();
}

function isClusterAdminRole(role: ClusterRoleWire): boolean {
  if (role === undefined || role === null) return false;
  if (typeof role === 'number') {
    return role === 1;
  }
  return role === 'CLUSTER_ROLE_ADMIN' || role === 'ADMIN';
}

type OidcStorageSnapshot = {
  accessToken: string | null;
};

async function readOidcSession(page: Page): Promise<OidcStorageSnapshot | null> {
  return page.evaluate(() => {
    let storageKey: string | null = null;
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith('oidc.user:')) {
        storageKey = key;
        break;
      }
    }

    if (!storageKey) return null;
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as { access_token?: unknown };
      return {
        accessToken: typeof parsed.access_token === 'string' ? parsed.access_token : null,
      };
    } catch (_error) {
      return null;
    }
  });
}

async function postConnect<T>(
  page: Page,
  servicePath: string,
  method: string,
  payload: unknown,
): Promise<T> {
  const session = await readOidcSession(page);
  const token = session?.accessToken ?? null;
  const headers = token ? { ...CONNECT_HEADERS, Authorization: `Bearer ${token}` } : CONNECT_HEADERS;
  const response = await page.context().request.post(buildRpcUrl(servicePath, method), {
    data: payload,
    headers,
  });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`ConnectRPC ${method} failed with status ${response.status()}: ${body}`);
  }
  return (await response.json()) as T;
}

export async function getMe(page: Page): Promise<GetMeResponseWire> {
  const response = await postConnect<GetMeResponseWire>(page, USERS_GATEWAY_PATH, 'GetMe', {});
  if (!response.user?.meta?.id) {
    throw new Error('GetMe response missing user identity id.');
  }
  return response;
}

export async function ensureClusterAdmin(page: Page): Promise<void> {
  const me = await getMe(page);
  if (isClusterAdminRole(me.clusterRole)) {
    return;
  }
  const identityId = me.user?.meta?.id;
  if (!identityId) {
    throw new Error('GetMe response missing identity id for cluster role update.');
  }
  const name = me.user?.name ?? me.user?.email ?? '';
  const nickname = me.user?.nickname ?? '';
  await postConnect<UpdateUserResponseWire>(page, USERS_GATEWAY_PATH, 'UpdateUser', {
    identityId,
    name: name || undefined,
    nickname: nickname || undefined,
    clusterRole: 'CLUSTER_ROLE_ADMIN',
  });
  const start = Date.now();
  while (Date.now() - start < 10000) {
    const updated = await getMe(page);
    if (isClusterAdminRole(updated.clusterRole)) {
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Cluster role update did not propagate in time.');
}

export async function createOrganization(page: Page, name: string): Promise<string> {
  const response = await postConnect<CreateOrganizationResponseWire>(
    page,
    ORGS_GATEWAY_PATH,
    'CreateOrganization',
    { name },
  );
  if (!response.organization?.id) {
    throw new Error('CreateOrganization response missing organization id.');
  }
  return response.organization.id;
}

export async function listAccessibleOrganizations(page: Page): Promise<OrganizationWire[]> {
  const me = await getMe(page);
  const identityId = me.user?.meta?.id;
  if (!identityId) {
    throw new Error('GetMe response missing identity id for ListAccessibleOrganizations.');
  }
  const response = await postConnect<ListAccessibleOrganizationsResponseWire>(
    page,
    ORGS_GATEWAY_PATH,
    'ListAccessibleOrganizations',
    { identityId },
  );
  return response.organizations ?? [];
}

async function waitForOrganization(page: Page, organizationId: string): Promise<void> {
  const timeoutMs = 10000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const organizations = await listAccessibleOrganizations(page);
    if (organizations.some((org) => org.id === organizationId)) {
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Organization ${organizationId} did not appear in time.`);
}

export async function setSelectedOrganization(page: Page, organizationId: string): Promise<void> {
  await waitForOrganization(page, organizationId);
  await page.evaluate((orgId) => {
    window.localStorage.setItem('console.selectedOrganization', orgId);
  }, organizationId);
}

export async function createUser(
  page: Page,
  opts: { email: string; nickname: string },
): Promise<string> {
  const now = Date.now();
  const oidcSubject = `e2e-${opts.email}-${now}`;
  const response = await postConnect<CreateUserResponseWire>(page, USERS_GATEWAY_PATH, 'CreateUser', {
    oidcSubject,
    name: opts.email,
    nickname: opts.nickname,
    clusterRole: 'CLUSTER_ROLE_UNSPECIFIED',
  });
  const identityId = response.user?.meta?.id;
  if (!identityId) {
    throw new Error('CreateUser response missing identity id.');
  }
  await postConnect<UpdateUserResponseWire>(page, USERS_GATEWAY_PATH, 'UpdateUser', {
    identityId,
    email: opts.email,
    nickname: opts.nickname,
  });
  return identityId;
}

export async function listUsers(page: Page): Promise<UserWire[]> {
  const response = await postConnect<ListUsersResponseWire>(page, USERS_GATEWAY_PATH, 'ListUsers', {
    pageSize: 200,
    pageToken: '',
  });
  return response.users ?? [];
}

async function resolveIdentityIdByEmail(page: Page, email: string): Promise<string> {
  const users = await listUsers(page);
  const match = users.find((user) => user.email === email);
  if (match?.meta?.id) {
    return match.meta.id;
  }
  return createUser(page, { email, nickname: email.split('@')[0] ?? 'e2e-user' });
}

export async function inviteMember(
  page: Page,
  opts: { organizationId: string; email: string; role: MembershipRoleValue },
): Promise<{ identityId: string; membershipId: string }> {
  const identityId = await resolveIdentityIdByEmail(page, opts.email);
  const response = await postConnect<CreateMembershipResponseWire>(
    page,
    ORGS_GATEWAY_PATH,
    'CreateMembership',
    {
      organizationId: opts.organizationId,
      identityId,
      role: opts.role,
    },
  );
  const membershipId = response.membership?.id;
  if (!membershipId) {
    throw new Error('CreateMembership response missing membership id.');
  }
  return { identityId, membershipId };
}

export async function listMembers(
  page: Page,
  opts: { organizationId: string; status?: MembershipStatusValue },
): Promise<MembershipWire[]> {
  const response = await postConnect<ListMembersResponseWire>(
    page,
    ORGS_GATEWAY_PATH,
    'ListMembers',
    {
      organizationId: opts.organizationId,
      status: opts.status ?? 'MEMBERSHIP_STATUS_UNSPECIFIED',
      pageSize: 200,
      pageToken: '',
    },
  );
  return response.memberships ?? [];
}

async function resolveMembership(
  page: Page,
  organizationId: string,
  identityId: string,
): Promise<MembershipWire> {
  const memberships = await listMembers(page, {
    organizationId,
    status: 'MEMBERSHIP_STATUS_UNSPECIFIED',
  });
  const membership = memberships.find((member) => member.identityId === identityId);
  if (!membership?.id) {
    throw new Error(`Membership not found for identity ${identityId}.`);
  }
  return membership;
}

export async function removeMember(
  page: Page,
  opts: { organizationId: string; identityId: string },
): Promise<void> {
  const membership = await resolveMembership(page, opts.organizationId, opts.identityId);
  await postConnect(page, ORGS_GATEWAY_PATH, 'RemoveMembership', {
    membershipId: membership.id,
  });
}

export async function changeMemberRole(
  page: Page,
  opts: { organizationId: string; identityId: string; role: MembershipRoleValue },
): Promise<void> {
  const membership = await resolveMembership(page, opts.organizationId, opts.identityId);
  const response = await postConnect<UpdateMembershipRoleResponseWire>(
    page,
    ORGS_GATEWAY_PATH,
    'UpdateMembershipRole',
    {
      membershipId: membership.id,
      role: opts.role,
    },
  );
  if (!response.membership?.id) {
    throw new Error('UpdateMembershipRole response missing membership id.');
  }
}

export async function createSecretProvider(
  page: Page,
  opts: { organizationId: string; name: string; url: string },
): Promise<string> {
  const response = await postConnect<CreateSecretProviderResponseWire>(
    page,
    SECRETS_GATEWAY_PATH,
    'CreateSecretProvider',
    {
      title: opts.name,
      description: `E2E provider for ${opts.name}`,
      type: 'SECRET_PROVIDER_TYPE_VAULT',
      config: {
        vault: {
          address: opts.url,
          token: 'e2e-token',
        },
      },
      organizationId: opts.organizationId,
    },
  );
  const providerId = response.secretProvider?.meta?.id;
  if (!providerId) {
    throw new Error('CreateSecretProvider response missing provider id.');
  }
  return providerId;
}

export async function listSecretProviders(
  page: Page,
  opts: { organizationId: string },
): Promise<Array<{ meta?: { id?: string }; title?: string }>> {
  const response = await postConnect<ListSecretProvidersResponseWire>(
    page,
    SECRETS_GATEWAY_PATH,
    'ListSecretProviders',
    {
      organizationId: opts.organizationId,
      pageSize: 200,
      pageToken: '',
    },
  );
  return response.secretProviders ?? [];
}

export async function createSecret(
  page: Page,
  opts: { providerId: string; name: string; value: string; organizationId: string },
): Promise<string> {
  const response = await postConnect<CreateSecretResponseWire>(page, SECRETS_GATEWAY_PATH, 'CreateSecret', {
    title: opts.name,
    description: `E2E secret for ${opts.name}`,
    secretProviderId: opts.providerId,
    remoteName: opts.value,
    organizationId: opts.organizationId,
  });
  const secretId = response.secret?.meta?.id;
  if (!secretId) {
    throw new Error('CreateSecret response missing secret id.');
  }
  return secretId;
}

export async function listRunners(page: Page): Promise<RunnerWire[]> {
  const response = await postConnect<ListRunnersResponseWire>(page, RUNNERS_GATEWAY_PATH, 'ListRunners', {
    pageSize: 200,
    pageToken: '',
  });
  return response.runners ?? [];
}

export async function getRunner(page: Page, runnerId: string): Promise<RunnerWire> {
  const response = await postConnect<GetRunnerResponseWire>(page, RUNNERS_GATEWAY_PATH, 'GetRunner', {
    id: runnerId,
  });
  if (!response.runner) {
    throw new Error('GetRunner response missing runner.');
  }
  return response.runner;
}
