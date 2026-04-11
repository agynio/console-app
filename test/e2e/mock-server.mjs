import http from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.MOCK_SERVER_PORT ?? 5000);
const proxyTarget = new URL(process.env.MOCK_PROXY_TARGET ?? 'http://127.0.0.1:4173');
const defaultUserId = 'user-1';
const defaultEmail = 'e2e-tester@agyn.test';

const users = new Map();
const organizations = new Map();
const memberships = new Map();
const secretProviders = new Map();
const secrets = new Map();
const runners = new Map();

const defaultUser = {
  id: defaultUserId,
  oidcSubject: 'e2e-oidc-user',
  name: 'E2E Tester',
  email: defaultEmail,
  nickname: 'tester',
  photoUrl: '',
  clusterRole: 'CLUSTER_ROLE_ADMIN',
};

users.set(defaultUserId, defaultUser);

const defaultRunner = {
  id: 'runner-1',
  name: 'Cluster Runner',
  labels: { region: 'local' },
  status: 'RUNNER_STATUS_ENROLLED',
  identityId: 'runner-identity',
  organizationId: '',
  openzitiServiceName: 'cluster-runner',
};

runners.set(defaultRunner.id, defaultRunner);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Connect-Protocol-Version');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
}

function sendJson(res, status, body) {
  setCors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  setCors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain');
  res.end(body);
}

function base64UrlEncode(input) {
  return Buffer.from(JSON.stringify(input))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createJwt(payload) {
  const header = base64UrlEncode({ alg: 'none', typ: 'JWT' });
  const encodedPayload = base64UrlEncode(payload);
  return `${header}.${encodedPayload}.`;
}

function proxyRequest(req, res) {
  const targetUrl = new URL(req.url ?? '/', proxyTarget);
  const proxy = http.request(
    {
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxy.on('error', () => {
    sendText(res, 502, 'Bad gateway');
  });
  req.pipe(proxy);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  const contentType = req.headers['content-type'] ?? '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return {};
}

function normalizeMembershipRole(value) {
  if (typeof value === 'string') return value;
  if (value === 1) return 'MEMBERSHIP_ROLE_OWNER';
  if (value === 2) return 'MEMBERSHIP_ROLE_MEMBER';
  return 'MEMBERSHIP_ROLE_UNSPECIFIED';
}

function normalizeMembershipStatus(value) {
  if (typeof value === 'string') return value;
  if (value === 1) return 'MEMBERSHIP_STATUS_PENDING';
  if (value === 2) return 'MEMBERSHIP_STATUS_ACTIVE';
  return 'MEMBERSHIP_STATUS_UNSPECIFIED';
}

function normalizeClusterRole(value) {
  if (typeof value === 'string') return value;
  if (value === 1) return 'CLUSTER_ROLE_ADMIN';
  return 'CLUSTER_ROLE_UNSPECIFIED';
}

function mapUser(user) {
  return {
    meta: { id: user.id },
    oidcSubject: user.oidcSubject,
    name: user.name,
    email: user.email,
    nickname: user.nickname,
    photoUrl: user.photoUrl,
  };
}

function mapMembership(membership) {
  return {
    id: membership.id,
    organizationId: membership.organizationId,
    identityId: membership.identityId,
    role: membership.role,
    status: membership.status,
  };
}

function mapRunner(runner) {
  return {
    meta: { id: runner.id },
    name: runner.name,
    labels: runner.labels,
    status: runner.status,
    identityId: runner.identityId,
    organizationId: runner.organizationId,
    openzitiServiceName: runner.openzitiServiceName,
  };
}

function mapSecretProvider(provider) {
  return {
    meta: { id: provider.id },
    title: provider.title,
    description: provider.description,
    type: provider.type,
    config: provider.config,
    organizationId: provider.organizationId,
  };
}

function mapSecret(secret) {
  return {
    meta: { id: secret.id },
    title: secret.title,
    description: secret.description,
    secretProviderId: secret.secretProviderId,
    remoteName: secret.remoteName,
    organizationId: secret.organizationId,
  };
}

function handleUsersGateway(method, body, res) {
  switch (method) {
    case 'GetMe': {
      return sendJson(res, 200, { user: mapUser(defaultUser), clusterRole: defaultUser.clusterRole });
    }
    case 'ListUsers': {
      return sendJson(res, 200, {
        users: Array.from(users.values()).map(mapUser),
        nextPageToken: '',
      });
    }
    case 'BatchGetUsers': {
      const ids = Array.isArray(body.identityIds) ? body.identityIds : [];
      const result = ids
        .map((id) => users.get(id))
        .filter(Boolean)
        .map(mapUser);
      return sendJson(res, 200, { users: result });
    }
    case 'CreateUser': {
      const id = randomUUID();
      const user = {
        id,
        oidcSubject: body.oidcSubject ?? `mock-${id}`,
        name: body.name ?? body.oidcSubject ?? id,
        email: body.email ?? '',
        nickname: body.nickname ?? '',
        photoUrl: body.photoUrl ?? '',
        clusterRole: normalizeClusterRole(body.clusterRole),
      };
      users.set(id, user);
      return sendJson(res, 200, { user: mapUser(user), clusterRole: user.clusterRole });
    }
    case 'UpdateUser': {
      const identityId = body.identityId;
      if (!identityId || !users.has(identityId)) {
        return sendText(res, 404, 'User not found');
      }
      const user = users.get(identityId);
      if (!user) return sendText(res, 404, 'User not found');
      user.email = body.email ?? user.email;
      user.name = body.name ?? user.name;
      user.nickname = body.nickname ?? user.nickname;
      user.photoUrl = body.photoUrl ?? user.photoUrl;
      if (body.clusterRole !== undefined) {
        user.clusterRole = normalizeClusterRole(body.clusterRole);
      }
      return sendJson(res, 200, { user: mapUser(user), clusterRole: user.clusterRole });
    }
    case 'GetUser': {
      const identityId = body.identityId;
      if (!identityId || !users.has(identityId)) {
        return sendText(res, 404, 'User not found');
      }
      const user = users.get(identityId);
      return sendJson(res, 200, { user: mapUser(user), clusterRole: user.clusterRole });
    }
    case 'DeleteUser': {
      if (body.identityId) users.delete(body.identityId);
      return sendJson(res, 200, {});
    }
    default:
      return sendText(res, 404, 'Unknown UsersGateway method');
  }
}

function handleOrganizationsGateway(method, body, res) {
  switch (method) {
    case 'CreateOrganization': {
      const id = randomUUID();
      const name = body.name ?? `org-${id}`;
      const org = { id, name };
      organizations.set(id, org);
      const membership = {
        id: randomUUID(),
        organizationId: id,
        identityId: defaultUserId,
        role: 'MEMBERSHIP_ROLE_OWNER',
        status: 'MEMBERSHIP_STATUS_ACTIVE',
      };
      memberships.set(membership.id, membership);
      return sendJson(res, 200, { organization: org });
    }
    case 'ListOrganizations': {
      return sendJson(res, 200, {
        organizations: Array.from(organizations.values()),
        nextPageToken: '',
      });
    }
    case 'ListAccessibleOrganizations': {
      return sendJson(res, 200, {
        organizations: Array.from(organizations.values()),
        nextPageToken: '',
      });
    }
    case 'ListMyMemberships': {
      const status = normalizeMembershipStatus(body.status);
      const result = Array.from(memberships.values()).filter((membership) => {
        if (membership.identityId !== defaultUserId) return false;
        if (status === 'MEMBERSHIP_STATUS_UNSPECIFIED') return true;
        return membership.status === status;
      });
      return sendJson(res, 200, { memberships: result.map(mapMembership), nextPageToken: '' });
    }
    case 'ListMembers': {
      const status = normalizeMembershipStatus(body.status);
      const result = Array.from(memberships.values()).filter((membership) => {
        if (membership.organizationId !== body.organizationId) return false;
        if (status === 'MEMBERSHIP_STATUS_UNSPECIFIED') return true;
        return membership.status === status;
      });
      return sendJson(res, 200, { memberships: result.map(mapMembership), nextPageToken: '' });
    }
    case 'CreateMembership': {
      const membership = {
        id: randomUUID(),
        organizationId: body.organizationId,
        identityId: body.identityId,
        role: normalizeMembershipRole(body.role),
        status: 'MEMBERSHIP_STATUS_PENDING',
      };
      memberships.set(membership.id, membership);
      return sendJson(res, 200, { membership: mapMembership(membership) });
    }
    case 'UpdateMembershipRole': {
      const membership = memberships.get(body.membershipId);
      if (!membership) return sendText(res, 404, 'Membership not found');
      membership.role = normalizeMembershipRole(body.role);
      return sendJson(res, 200, { membership: mapMembership(membership) });
    }
    case 'RemoveMembership': {
      memberships.delete(body.membershipId);
      return sendJson(res, 200, {});
    }
    default:
      return sendText(res, 404, 'Unknown OrganizationsGateway method');
  }
}

function handleSecretsGateway(method, body, res) {
  switch (method) {
    case 'CreateSecretProvider': {
      const provider = {
        id: randomUUID(),
        title: body.title ?? 'Provider',
        description: body.description ?? '',
        type: body.type ?? 'SECRET_PROVIDER_TYPE_VAULT',
        config: body.config ?? {},
        organizationId: body.organizationId ?? '',
      };
      secretProviders.set(provider.id, provider);
      return sendJson(res, 200, { secretProvider: mapSecretProvider(provider) });
    }
    case 'ListSecretProviders': {
      const providers = Array.from(secretProviders.values()).filter(
        (provider) => provider.organizationId === body.organizationId,
      );
      return sendJson(res, 200, { secretProviders: providers.map(mapSecretProvider), nextPageToken: '' });
    }
    case 'DeleteSecretProvider': {
      if (body.id) {
        secretProviders.delete(body.id);
        for (const [secretId, secret] of secrets.entries()) {
          if (secret.secretProviderId === body.id) {
            secrets.delete(secretId);
          }
        }
      }
      return sendJson(res, 200, {});
    }
    case 'CreateSecret': {
      const secret = {
        id: randomUUID(),
        title: body.title ?? 'Secret',
        description: body.description ?? '',
        secretProviderId: body.secretProviderId ?? '',
        remoteName: body.remoteName ?? '',
        organizationId: body.organizationId ?? '',
      };
      secrets.set(secret.id, secret);
      return sendJson(res, 200, { secret: mapSecret(secret) });
    }
    case 'ListSecrets': {
      const providerId = body.secretProviderId || '';
      const result = Array.from(secrets.values()).filter((secret) => {
        if (secret.organizationId !== body.organizationId) return false;
        if (!providerId) return true;
        return secret.secretProviderId === providerId;
      });
      return sendJson(res, 200, { secrets: result.map(mapSecret), nextPageToken: '' });
    }
    case 'DeleteSecret': {
      if (body.id) secrets.delete(body.id);
      return sendJson(res, 200, {});
    }
    default:
      return sendText(res, 404, 'Unknown SecretsGateway method');
  }
}

function handleRunnersGateway(method, body, res) {
  switch (method) {
    case 'ListRunners': {
      const orgId = body.organizationId ?? '';
      const result = Array.from(runners.values()).filter((runner) => {
        if (!orgId) return !runner.organizationId;
        return runner.organizationId === orgId;
      });
      return sendJson(res, 200, { runners: result.map(mapRunner), nextPageToken: '' });
    }
    case 'GetRunner': {
      const runner = runners.get(body.id);
      if (!runner) return sendText(res, 404, 'Runner not found');
      return sendJson(res, 200, { runner: mapRunner(runner) });
    }
    case 'ListWorkloads': {
      return sendJson(res, 200, { workloads: [], nextPageToken: '' });
    }
    case 'UpdateRunner': {
      const runner = runners.get(body.id);
      if (!runner) return sendText(res, 404, 'Runner not found');
      runner.labels = body.labels ?? runner.labels;
      return sendJson(res, 200, { runner: mapRunner(runner) });
    }
    case 'DeleteRunner': {
      if (body.id) runners.delete(body.id);
      return sendJson(res, 200, {});
    }
    default:
      return sendText(res, 404, 'Unknown RunnersGateway method');
  }
}

function handleAgentsGateway(method, _body, res) {
  if (method === 'ListAgents') {
    return sendJson(res, 200, { agents: [], nextPageToken: '' });
  }
  return sendText(res, 404, 'Unknown AgentsGateway method');
}

function handleAppsGateway(method, _body, res) {
  if (method === 'ListInstallations') {
    return sendJson(res, 200, { installations: [], nextPageToken: '' });
  }
  return sendText(res, 404, 'Unknown AppsGateway method');
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/healthz') {
    return sendText(res, 200, 'ok');
  }

  if (pathname === '/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri');
    if (!redirectUri) return sendText(res, 400, 'missing redirect_uri');
    const state = url.searchParams.get('state');
    const code = randomUUID();
    const redirect = new URL(redirectUri);
    redirect.searchParams.set('code', code);
    if (state) redirect.searchParams.set('state', state);
    res.statusCode = 302;
    res.setHeader('Location', redirect.toString());
    res.end();
    return;
  }

  if (pathname === '/token') {
    const token = randomUUID();
    const idToken = createJwt({
      sub: defaultUserId,
      name: defaultUser.name,
      email: defaultUser.email,
    });
    return sendJson(res, 200, {
      access_token: `access-${token}`,
      id_token: idToken,
      refresh_token: `refresh-${token}`,
      token_type: 'Bearer',
      scope: 'openid profile email',
      expires_in: 3600,
      session_state: randomUUID(),
    });
  }

  if (pathname === '/end-session') {
    const redirectUri = url.searchParams.get('post_logout_redirect_uri');
    if (!redirectUri) {
      return sendText(res, 400, 'missing post_logout_redirect_uri');
    }
    res.statusCode = 302;
    res.setHeader('Location', redirectUri);
    res.end();
    return;
  }

  if (pathname === '/jwks.json') {
    return sendJson(res, 200, { keys: [] });
  }

  if (pathname === '/userinfo') {
    return sendJson(res, 200, {
      sub: defaultUserId,
      name: defaultUser.name,
      email: defaultUser.email,
    });
  }

  if (pathname === '/api/test/client-auth-strategies') {
    if (req.method === 'POST') {
      return sendJson(res, 200, {});
    }
  }

  if (pathname.startsWith('/api/')) {
    const body = await parseBody(req);
    const parts = pathname.split('/').filter(Boolean);
    const service = parts[1];
    const method = parts[2];
    if (!service || !method) return sendText(res, 404, 'Invalid gateway path');
    if (service === 'agynio.api.gateway.v1.UsersGateway') {
      return handleUsersGateway(method, body, res);
    }
    if (service === 'agynio.api.gateway.v1.OrganizationsGateway') {
      return handleOrganizationsGateway(method, body, res);
    }
    if (service === 'agynio.api.gateway.v1.SecretsGateway') {
      return handleSecretsGateway(method, body, res);
    }
    if (service === 'agynio.api.gateway.v1.RunnersGateway') {
      return handleRunnersGateway(method, body, res);
    }
    if (service === 'agynio.api.gateway.v1.AgentsGateway') {
      return handleAgentsGateway(method, body, res);
    }
    if (service === 'agynio.api.gateway.v1.AppsGateway') {
      return handleAppsGateway(method, body, res);
    }
    return sendText(res, 404, 'Unknown gateway');
  }

  return proxyRequest(req, res);
});

server.listen(port, () => {
  console.log(`[mock-server] listening on ${port}`);
});
