import http from 'node:http';

const port = Number(process.env.MOCK_SERVER_PORT ?? 5000);
const nowIso = new Date().toISOString();

const users = [
  { id: 'user-1', name: 'E2E Tester', email: 'e2e-tester@agyn.test', nickname: 'tester' },
];
const agents = [{ id: 'agent-1', name: 'Default Agent', nickname: 'default' }];
const appProfiles = [{ identityId: 'app-1', name: 'Default App', slug: 'default-app' }];
const models = [
  { id: 'model-1', name: 'gpt-4o-mini' },
  { id: 'model-2', name: 'claude-3-opus' },
];

const identityIds = [...users.map((user) => user.id), ...agents.map((agent) => agent.id), 'app-1'];
const modelIds = models.map((model) => model.id);

const unitBaseValues = new Map([
  [1, 12_000_000n],
  [2, 36_000_000_000n],
  [3, 18_000_000_000n],
  [4, 4_000_000n],
]);

const granularityStepsMs = new Map([
  [2, 24 * 60 * 60 * 1000],
  [3, 5 * 60 * 1000],
  [4, 60 * 60 * 1000],
  [5, 6 * 60 * 60 * 1000],
]);

function buildMeta(id) {
  return { id, createdAt: nowIso, updatedAt: nowIso };
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain');
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) {
        resolve({ ok: true, value: {} });
        return;
      }
      try {
        resolve({ ok: true, value: JSON.parse(data) });
      } catch (error) {
        resolve({ ok: false, error });
      }
    });
  });
}

function parseRequestPath(value) {
  if (!value) return null;
  const { pathname } = new URL(value, 'http://localhost');
  const [_, service, method] = pathname.split('/');
  if (!service || !method) return null;
  return { service, method };
}

function normalizeGranularity(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    if (value.includes('TOTAL')) return 1;
    if (value.includes('DAY')) return 2;
    if (value.includes('FIVE')) return 3;
    if (value.includes('HOUR')) return 4;
    if (value.includes('SIX')) return 5;
  }
  return 1;
}

function normalizeUnit(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    if (value.includes('TOKENS')) return 1;
    if (value.includes('CORE')) return 2;
    if (value.includes('GB')) return 3;
    if (value.includes('COUNT')) return 4;
  }
  return 0;
}

function parseTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object') {
    const seconds = Number(value.seconds ?? 0);
    const nanos = Number(value.nanos ?? 0);
    if (!Number.isFinite(seconds)) return null;
    return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000));
  }
  return null;
}

function resolveGroupValues(groupBy) {
  if (groupBy === 'status') return ['success', 'failed'];
  if (groupBy === 'kind') return ['input', 'cached', 'output'];
  if (groupBy === 'identity_id') return identityIds;
  if (groupBy === 'resource_id') return modelIds;
  return ['total'];
}

function resolveBaseValue(unit, labelFilters) {
  const baseValue = unitBaseValues.get(unit) ?? 8_000_000n;
  const kind = labelFilters?.kind ?? '';
  if (kind === 'cached') return baseValue / 3n;
  if (kind === 'output') return baseValue / 2n;
  if (kind === 'ram') return baseValue / 2n;
  if (kind === 'storage') return baseValue / 4n;
  return baseValue;
}

function buildBuckets({ groupBy, groupValues, granularity, baseValue, start, end }) {
  const stepMs = granularityStepsMs.get(granularity) ?? 0;
  if (!stepMs) {
    const value = baseValue / BigInt(groupValues.length || 1) || 1n;
    return groupValues.map((groupValue) => {
      const bucket = { value: value.toString() };
      if (groupBy) bucket.groupValue = groupValue;
      return bucket;
    });
  }

  const endDate = end ?? new Date();
  const startDate = start ?? new Date(endDate.getTime() - stepMs * 5);
  const timestamps = [];
  for (let ts = startDate.getTime(); ts <= endDate.getTime(); ts += stepMs) {
    timestamps.push(ts);
  }
  const totalBuckets = BigInt(Math.max(1, timestamps.length * groupValues.length));
  const perBucket = baseValue / totalBuckets || 1n;
  const buckets = [];
  for (const timestamp of timestamps) {
    for (const groupValue of groupValues) {
      const bucket = {
        value: perBucket.toString(),
        timestamp: new Date(timestamp).toISOString(),
      };
      if (groupBy) bucket.groupValue = groupValue;
      buckets.push(bucket);
    }
  }
  return buckets;
}

function handleUsersGateway(method, body, res) {
  if (method !== 'BatchGetUsers') {
    return sendText(res, 404, 'Unknown UsersGateway method');
  }
  const ids = body.identityIds ?? body.identity_ids ?? [];
  const batch = users
    .filter((user) => ids.includes(user.id))
    .map((user) => ({
      meta: buildMeta(user.id),
      name: user.name,
      email: user.email,
      nickname: user.nickname,
      photoUrl: '',
    }));
  return sendJson(res, 200, { users: batch });
}

function handleAgentsGateway(method, body, res) {
  if (method !== 'GetAgent') {
    return sendText(res, 404, 'Unknown AgentsGateway method');
  }
  const id = body.id ?? body.identityId ?? body.identity_id ?? '';
  const agent = agents.find((entry) => entry.id === id);
  if (!agent) return sendText(res, 404, 'Agent not found');
  return sendJson(res, 200, {
    agent: { meta: buildMeta(agent.id), name: agent.name, nickname: agent.nickname },
  });
}

function handleAppsGateway(method, body, res) {
  if (method !== 'GetAppProfile') {
    return sendText(res, 404, 'Unknown AppsGateway method');
  }
  const identityId = body.identityId ?? body.identity_id ?? '';
  const profile = appProfiles.find((entry) => entry.identityId === identityId);
  if (!profile) return sendText(res, 404, 'Profile not found');
  return sendJson(res, 200, { profile: { name: profile.name, slug: profile.slug, identityId } });
}

function handleLlmGateway(method, body, res) {
  if (method !== 'ListModels') {
    return sendText(res, 404, 'Unknown LLMGateway method');
  }
  return sendJson(res, 200, {
    models: models.map((model) => ({ meta: buildMeta(model.id), name: model.name })),
  });
}

function handleMeteringGateway(method, body, res) {
  if (method !== 'QueryUsage') {
    return sendText(res, 404, 'Unknown MeteringGateway method');
  }
  const orgId = body.orgId ?? body.org_id ?? '';
  if (!orgId) return sendJson(res, 200, { buckets: [] });
  const granularity = normalizeGranularity(body.granularity);
  const groupBy = body.groupBy ?? body.group_by ?? '';
  const labelFilters = body.labelFilters ?? body.label_filters ?? {};
  const groupValues = resolveGroupValues(groupBy);
  const baseValue = resolveBaseValue(normalizeUnit(body.unit), labelFilters);
  const start = parseTimestamp(body.start);
  const end = parseTimestamp(body.end);
  const buckets = buildBuckets({ groupBy, groupValues, granularity, baseValue, start, end });
  return sendJson(res, 200, { buckets });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization,connect-protocol-version');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendText(res, 404, 'Not found');
    return;
  }

  const route = parseRequestPath(req.url);
  if (!route) {
    sendText(res, 404, 'Not found');
    return;
  }
  const parsedBody = await readJson(req);
  if (!parsedBody.ok) {
    sendText(res, 400, 'Invalid JSON');
    return;
  }
  const body = parsedBody.value;

  if (route.service === 'agynio.api.gateway.v1.UsersGateway') {
    return handleUsersGateway(route.method, body, res);
  }
  if (route.service === 'agynio.api.gateway.v1.AgentsGateway') {
    return handleAgentsGateway(route.method, body, res);
  }
  if (route.service === 'agynio.api.gateway.v1.AppsGateway') {
    return handleAppsGateway(route.method, body, res);
  }
  if (route.service === 'agynio.api.gateway.v1.LLMGateway') {
    return handleLlmGateway(route.method, body, res);
  }
  if (route.service === 'agynio.api.gateway.v1.MeteringGateway') {
    return handleMeteringGateway(route.method, body, res);
  }

  return sendText(res, 404, 'Unknown gateway');
});

server.listen(port, () => {
  console.log(`[mock-server] listening on ${port}`);
});
