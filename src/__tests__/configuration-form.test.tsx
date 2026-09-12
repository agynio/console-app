import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { UpdateInstallationDialog } from '@/components/UpdateInstallationDialog';
import { EntityMetaSchema, InstallationSchema } from '@/gen/agynio/api/apps/v1/apps_pb';

// Renders the generated form for real, against the shape the API actually
// returns. The previous dialog test mocked only updateInstallation, so the
// schema path never ran and a bad read of App.configurationSchema reached the
// browser.
const { updateInstallation, getApp, listAgents } = vi.hoisted(() => ({
  updateInstallation: vi.fn(),
  getApp: vi.fn(),
  listAgents: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  appsClient: { updateInstallation, getApp },
  agentsClient: { listAgents },
  llmClient: { listModels: vi.fn() },
}));

const AGENT_ID = '8f14e45f-ceea-467a-9575-6f2f0f1f0f0f';

// google.protobuf.Struct fields are generated as plain JsonObject, so this is
// exactly what the wire gives the component — no message wrapper, no toJson().
const schema = {
  type: 'object',
  properties: {
    bot_token: { type: 'string', title: 'Bot token', 'x-agyn-secret': true },
    agent_id: { type: 'string', title: 'Agent', format: 'uuid', 'x-agyn-ref': 'agent' },
    retries: { type: 'integer', title: 'Retries', minimum: 0, maximum: 5 },
    verbose: { type: 'boolean', title: 'Verbose' },
    mode: { type: 'string', title: 'Mode', enum: ['fast', 'slow'] },
    channels: { type: 'array', title: 'Channels', items: { type: 'string' } },
    legacy: { type: 'string', title: 'Legacy', deprecated: true },
  },
  required: ['bot_token', 'agent_id'],
};

function renderDialog(configuration: Record<string, unknown> = {}, secretKeysSet: string[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UpdateInstallationDialog
        open
        onOpenChange={vi.fn()}
        installation={create(InstallationSchema, {
          meta: create(EntityMetaSchema, { id: 'installation-1' }),
          appId: 'app-1',
          organizationId: 'org-1',
          slug: 'demo',
          configuration,
          secretKeysSet,
        })}
        organizationId="org-1"
      />
    </QueryClientProvider>,
  );
}

describe('generated configuration form', () => {
  afterEach(cleanup);

  beforeEach(() => {
    updateInstallation.mockReset();
    getApp.mockReset();
    listAgents.mockReset();
    getApp.mockResolvedValue({ app: { meta: { id: 'app-1' }, configurationSchema: schema } });
    listAgents.mockResolvedValue({ agents: [{ meta: { id: AGENT_ID }, name: 'support-agent' }] });
  });

  it('renders a field per declared property instead of a JSON editor', async () => {
    renderDialog({ agent_id: AGENT_ID }, ['bot_token']);

    await waitFor(() => {
      expect(screen.getByTestId('update-installation-configuration-form')).toBeTruthy();
    });

    for (const label of ['Bot token', 'Agent', 'Retries', 'Verbose', 'Mode', 'Channels']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByTestId('update-installation-configuration')).toBeNull();
  });

  it('shows a stored secret as Set rather than as a value', async () => {
    renderDialog({ agent_id: AGENT_ID }, ['bot_token']);

    await waitFor(() => {
      expect(screen.getByText('Set')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Replace' })).toBeTruthy();
  });

  it('resolves a reference to the entity name, not a UUID field', async () => {
    renderDialog({ agent_id: AGENT_ID }, ['bot_token']);

    await waitFor(() => {
      expect(screen.getByText('support-agent')).toBeTruthy();
    });
  });

  it('hides a deprecated property until the installation carries it', async () => {
    renderDialog({ agent_id: AGENT_ID }, ['bot_token']);
    await waitFor(() => {
      expect(screen.getByTestId('update-installation-configuration-form')).toBeTruthy();
    });
    expect(screen.queryByText('Legacy')).toBeNull();

    cleanup();

    renderDialog({ agent_id: AGENT_ID, legacy: 'old value' }, ['bot_token']);
    await waitFor(() => {
      expect(screen.getByText('Legacy')).toBeTruthy();
    });
    expect(screen.getByText('Deprecated')).toBeTruthy();
  });

  it('falls back to the JSON editor when the stored configuration does not match the schema', async () => {
    // An undeclared key can only predate the schema; the form cannot express it.
    renderDialog({ agent_id: AGENT_ID, gone: 'x' }, ['bot_token']);

    await waitFor(() => {
      expect(screen.getByTestId('update-installation-configuration-mismatch')).toBeTruthy();
    });
    expect(screen.getByTestId('update-installation-configuration')).toBeTruthy();
  });

  it('falls back to the JSON editor when the app has reported no schema', async () => {
    getApp.mockResolvedValue({ app: { meta: { id: 'app-1' } } });
    renderDialog({ anything: 'goes' });

    await waitFor(() => {
      expect(screen.getByTestId('update-installation-configuration')).toBeTruthy();
    });
    expect(screen.queryByTestId('update-installation-configuration-form')).toBeNull();
  });
});
