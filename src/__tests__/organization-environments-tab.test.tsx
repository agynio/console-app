import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageTitleProvider } from '@/context/PageTitleContext';
import { EntityMetaSchema, EnvironmentSchema } from '@/gen/agynio/api/agents/v1/agents_pb';
import {
  ComputeResourcesSchema,
  EntityMetaSchema as RunnerEntityMetaSchema,
  FlavorSchema,
  RunnerSchema,
  RunnerStatus,
} from '@/gen/agynio/api/runners/v1/runners_pb';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';
import { OrganizationEnvironmentsTab } from '@/pages/OrganizationEnvironmentsTab';

const { listEnvironments, createEnvironment, updateEnvironment, deleteEnvironment } = vi.hoisted(() => ({
  listEnvironments: vi.fn(),
  createEnvironment: vi.fn(),
  updateEnvironment: vi.fn(),
  deleteEnvironment: vi.fn(),
}));

const { listRunners, listFlavors } = vi.hoisted(() => ({
  listRunners: vi.fn(),
  listFlavors: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  agentsClient: {
    listEnvironments,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
  },
  runnersClient: {
    listRunners,
    listFlavors,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function buildEnvironment({
  id,
  name,
  image,
  runnerId,
  flavor,
}: {
  id: string;
  name: string;
  image: string;
  runnerId: string;
  flavor: string;
}) {
  return create(EnvironmentSchema, {
    meta: create(EntityMetaSchema, { id }),
    organizationId: 'org-1',
    name,
    image,
    runnerId,
    flavor,
  });
}

function renderEnvironmentsTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/organizations/org-1/environments']}>
          <Routes>
            <Route path="/organizations/:id/environments" element={<OrganizationEnvironmentsTab />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </PageTitleProvider>,
  );
}

async function openSelect(testId: string) {
  fireEvent.click(screen.getByTestId(testId));
  return screen.findByRole('listbox');
}

describe('OrganizationEnvironmentsTab', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listEnvironments.mockReset();
    createEnvironment.mockReset();
    updateEnvironment.mockReset();
    deleteEnvironment.mockReset();
    listRunners.mockReset();
    listFlavors.mockReset();

    listEnvironments.mockResolvedValue({
      environments: [
        buildEnvironment({
          id: 'env-1',
          name: 'default',
          image: 'ghcr.io/agynio/sandbox:latest',
          runnerId: 'runner-1',
          flavor: 'small',
        }),
        buildEnvironment({
          id: 'env-2',
          name: 'gpu',
          image: 'ghcr.io/agynio/sandbox:gpu',
          runnerId: 'runner-1',
          flavor: '',
        }),
      ],
      nextPageToken: '',
    });

    listRunners.mockResolvedValue({
      runners: [
        create(RunnerSchema, {
          meta: create(RunnerEntityMetaSchema, { id: 'runner-1' }),
          name: 'org-runner',
          status: RunnerStatus.ENROLLED,
        }),
      ],
      nextPageToken: '',
    });

    listFlavors.mockResolvedValue({
      flavors: [
        create(FlavorSchema, {
          runnerId: 'runner-1',
          name: 'ram-2gb',
          default: true,
          resources: create(ComputeResourcesSchema, { requestsCpu: '500m', requestsMemory: '2Gi' }),
        }),
        create(FlavorSchema, {
          runnerId: 'runner-1',
          name: 'ram-4gb',
          resources: create(ComputeResourcesSchema, { requestsCpu: '1', requestsMemory: '4Gi' }),
        }),
        create(FlavorSchema, {
          runnerId: 'runner-1',
          name: 'retired',
          deprecated: true,
        }),
      ],
      nextPageToken: '',
    });
  });

  it('renders environments with the resolved runner and flavor', async () => {
    renderEnvironmentsTab();

    expect(await screen.findByText('default')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getAllByTestId('organization-environment-row')).toHaveLength(2);
    });

    const [firstRow, secondRow] = screen.getAllByTestId('organization-environment-row');
    expect(within(firstRow).getByTestId('organization-environment-image').textContent).toBe(
      'ghcr.io/agynio/sandbox:latest',
    );
    expect(within(firstRow).getByTestId('organization-environment-runner').textContent).toBe('org-runner');
    expect(within(firstRow).getByTestId('organization-environment-flavor').textContent).toBe('small');
    // An empty flavor resolves to the runner's default at workload start.
    expect(within(secondRow).getByTestId('organization-environment-flavor').textContent).toBe('Runner default');

    expect(listEnvironments).toHaveBeenCalledWith({
      organizationId: 'org-1',
      pageSize: DEFAULT_PAGE_SIZE,
      pageToken: '',
    });
    expect(listRunners).toHaveBeenCalledWith({
      organizationId: 'org-1',
      pageSize: MAX_PAGE_SIZE,
      pageToken: '',
    });
  });

  it('creates an environment with the selected runner and flavor', async () => {
    createEnvironment.mockResolvedValue({
      environment: buildEnvironment({
        id: 'env-3',
        name: 'builder',
        image: 'ghcr.io/agynio/sandbox:builder',
        runnerId: 'runner-1',
        flavor: 'large',
      }),
    });

    renderEnvironmentsTab();

    expect(await screen.findByText('default')).toBeTruthy();

    fireEvent.click(screen.getByTestId('organization-environments-create'));
    expect(await screen.findByTestId('organization-environments-create-dialog')).toBeTruthy();

    fireEvent.change(screen.getByTestId('organization-environments-create-name'), {
      target: { value: 'builder' },
    });
    fireEvent.change(screen.getByTestId('organization-environments-create-image'), {
      target: { value: 'ghcr.io/agynio/sandbox:builder' },
    });

    const runnerListbox = await openSelect('organization-environments-create-runner');
    fireEvent.click(within(runnerListbox).getByText('org-runner'));

    fireEvent.change(screen.getByTestId('organization-environments-create-flavor'), {
      target: { value: 'large' },
    });

    fireEvent.click(screen.getByTestId('organization-environments-create-submit'));

    await waitFor(() => {
      expect(createEnvironment).toHaveBeenCalledWith({
        organizationId: 'org-1',
        name: 'builder',
        image: 'ghcr.io/agynio/sandbox:builder',
        runnerId: 'runner-1',
        flavor: 'large',
      });
    });
  });

  // The list is a convenience over a free-text field: it must offer the
  // runner's reported flavors without becoming the only accepted input.
  it('offers the selected runner\'s flavors and fills the field when one is picked', async () => {
    createEnvironment.mockResolvedValue({
      environment: buildEnvironment({ id: 'env-4', name: 'picked', runnerId: 'runner-1', flavor: 'ram-4gb' }),
    });

    renderEnvironmentsTab();
    expect(await screen.findByText('default')).toBeTruthy();

    fireEvent.click(screen.getByTestId('organization-environments-create'));
    expect(await screen.findByTestId('organization-environments-create-dialog')).toBeTruthy();

    fireEvent.change(screen.getByTestId('organization-environments-create-name'), {
      target: { value: 'picked' },
    });
    fireEvent.change(screen.getByTestId('organization-environments-create-image'), {
      target: { value: 'ghcr.io/agynio/sandbox:latest' },
    });
    const runnerListbox = await openSelect('organization-environments-create-runner');
    fireEvent.click(within(runnerListbox).getByText('org-runner'));

    fireEvent.click(screen.getByTestId('organization-environments-create-flavor-toggle'));

    // Reported entries are offered; a deprecated one is not.
    expect(await screen.findByTestId('organization-environments-create-flavor-option-ram-4gb')).toBeTruthy();
    expect(screen.getByTestId('organization-environments-create-flavor-option-ram-2gb')).toBeTruthy();
    expect(screen.queryByTestId('organization-environments-create-flavor-option-retired')).toBeNull();

    fireEvent.click(screen.getByTestId('organization-environments-create-flavor-option-ram-4gb'));

    fireEvent.click(screen.getByTestId('organization-environments-create-submit'));
    await waitFor(() => {
      expect(createEnvironment).toHaveBeenCalledWith({
        organizationId: 'org-1',
        name: 'picked',
        image: 'ghcr.io/agynio/sandbox:latest',
        runnerId: 'runner-1',
        flavor: 'ram-4gb',
      });
    });
  });

  it('still accepts a flavor the runner never reported', async () => {
    createEnvironment.mockResolvedValue({
      environment: buildEnvironment({ id: 'env-5', name: 'custom', runnerId: 'runner-1', flavor: 'not-in-catalog' }),
    });

    renderEnvironmentsTab();
    expect(await screen.findByText('default')).toBeTruthy();

    fireEvent.click(screen.getByTestId('organization-environments-create'));
    expect(await screen.findByTestId('organization-environments-create-dialog')).toBeTruthy();

    fireEvent.change(screen.getByTestId('organization-environments-create-name'), {
      target: { value: 'custom' },
    });
    fireEvent.change(screen.getByTestId('organization-environments-create-image'), {
      target: { value: 'ghcr.io/agynio/sandbox:latest' },
    });
    const listbox = await openSelect('organization-environments-create-runner');
    fireEvent.click(within(listbox).getByText('org-runner'));

    fireEvent.change(screen.getByTestId('organization-environments-create-flavor'), {
      target: { value: 'not-in-catalog' },
    });

    fireEvent.click(screen.getByTestId('organization-environments-create-submit'));
    await waitFor(() => {
      expect(createEnvironment).toHaveBeenCalledWith({
        organizationId: 'org-1',
        name: 'custom',
        image: 'ghcr.io/agynio/sandbox:latest',
        runnerId: 'runner-1',
        flavor: 'not-in-catalog',
      });
    });
  });

  it('creates an environment with an empty flavor', async () => {
    createEnvironment.mockResolvedValue({
      environment: buildEnvironment({
        id: 'env-4',
        name: 'defaults',
        image: 'ghcr.io/agynio/sandbox:latest',
        runnerId: 'runner-1',
        flavor: '',
      }),
    });

    renderEnvironmentsTab();

    expect(await screen.findByText('default')).toBeTruthy();

    fireEvent.click(screen.getByTestId('organization-environments-create'));
    expect(await screen.findByTestId('organization-environments-create-dialog')).toBeTruthy();

    fireEvent.change(screen.getByTestId('organization-environments-create-name'), {
      target: { value: 'defaults' },
    });
    fireEvent.change(screen.getByTestId('organization-environments-create-image'), {
      target: { value: 'ghcr.io/agynio/sandbox:latest' },
    });

    const runnerListbox = await openSelect('organization-environments-create-runner');
    fireEvent.click(within(runnerListbox).getByText('org-runner'));

    fireEvent.click(screen.getByTestId('organization-environments-create-submit'));

    await waitFor(() => {
      expect(createEnvironment).toHaveBeenCalledWith({
        organizationId: 'org-1',
        name: 'defaults',
        image: 'ghcr.io/agynio/sandbox:latest',
        runnerId: 'runner-1',
        flavor: '',
      });
    });
  });

  it('requires a name, image, and runner before submitting', async () => {
    renderEnvironmentsTab();

    expect(await screen.findByText('default')).toBeTruthy();

    fireEvent.click(screen.getByTestId('organization-environments-create'));
    expect(await screen.findByTestId('organization-environments-create-dialog')).toBeTruthy();

    fireEvent.click(screen.getByTestId('organization-environments-create-submit'));

    expect(await screen.findByText('Name is required.')).toBeTruthy();
    expect(screen.getByText('Image is required.')).toBeTruthy();
    expect(screen.getByText('Runner is required.')).toBeTruthy();
    expect(createEnvironment).not.toHaveBeenCalled();
  });
});
