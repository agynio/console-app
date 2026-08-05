import { create } from '@bufbuild/protobuf';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  EntityMetaSchema as ImageEntityMetaSchema,
  ImageSchema,
  ImageType,
  ImageVersionSchema,
} from '@/gen/agynio/api/images/v1/images_pb';
import { AgentMcpsTab } from '@/pages/agent-detail/AgentMcpsTab';

const { listMcps, createMcp } = vi.hoisted(() => ({
  listMcps: vi.fn(),
  createMcp: vi.fn(),
}));

const { listImages, refreshImage } = vi.hoisted(() => ({
  listImages: vi.fn(),
  refreshImage: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  agentsClient: { listMcps, createMcp, updateMcp: vi.fn(), deleteMcp: vi.fn() },
  imagesClient: { listImages, refreshImage },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentMcpsTab agentId="agent-1" organizationId="org-1" />
    </QueryClientProvider>,
  );
}

describe('AgentMcpsTab image selection', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => cleanup());

  beforeEach(() => {
    listMcps.mockReset();
    createMcp.mockReset();
    listImages.mockReset();
    refreshImage.mockReset();

    listMcps.mockResolvedValue({ mcps: [], nextPageToken: '' });
    createMcp.mockResolvedValue({});
    listImages.mockResolvedValue({
      images: [
        create(ImageSchema, {
          meta: create(ImageEntityMetaSchema, { id: 'image-9' }),
          organizationId: 'org-1',
          name: 'mcp-github',
          type: ImageType.MCP,
        }),
      ],
      nextPageToken: '',
    });
    refreshImage.mockResolvedValue({
      versions: [create(ImageVersionSchema, { tag: '2.0.0' }), create(ImageVersionSchema, { tag: '1.0.0' })],
    });
  });

  // An MCP hosts either a purpose-built server image or a devcontainer, so the
  // picker has to offer both types rather than mcp alone.
  it('offers mcp and workspace images', async () => {
    renderTab();
    fireEvent.click(await screen.findByTestId('agent-mcps-create'));

    await waitFor(() => {
      expect(listImages).toHaveBeenCalledWith(expect.objectContaining({ type: ImageType.MCP }));
      expect(listImages).toHaveBeenCalledWith(expect.objectContaining({ type: ImageType.WORKSPACE }));
    });
  });

  // Preselection is a starting point, not a floor: clearing the field used to
  // refill it on the next render, so a version could not be emptied.
  it('leaves the version cleared once it is cleared', async () => {
    renderTab();
    fireEvent.click(await screen.findByTestId('agent-mcps-create'));

    fireEvent.click(screen.getByTestId('agent-mcps-create-image-toggle'));
    fireEvent.click(await screen.findByTestId('agent-mcps-create-image-option-mcp-github'));

    const version = () => screen.getByTestId('agent-mcps-create-version') as HTMLInputElement;
    await waitFor(() => expect(version().value).toBe('2.0.0'));

    fireEvent.change(version(), { target: { value: '' } });
    await waitFor(() => expect(version().value).toBe(''));
  });

  it('creates an MCP from a catalog image and version rather than a typed reference', async () => {
    renderTab();
    fireEvent.click(await screen.findByTestId('agent-mcps-create'));

    fireEvent.change(await screen.findByTestId('agent-mcps-create-name'), {
      target: { value: 'github' },
    });

    fireEvent.click(screen.getByTestId('agent-mcps-create-image-toggle'));
    fireEvent.click(await screen.findByTestId('agent-mcps-create-image-option-mcp-github'));

    // The version picker preselects the newest tag, so no second choice is
    // needed for the common case.
    await waitFor(() =>
      expect((screen.getByTestId('agent-mcps-create-version') as HTMLInputElement).value).toBe('2.0.0'),
    );

    fireEvent.click(screen.getByTestId('agent-mcps-create-submit'));

    await waitFor(() => {
      expect(createMcp).toHaveBeenCalledWith(
        expect.objectContaining({ imageId: 'image-9', imageTag: '2.0.0' }),
      );
    });
    expect(createMcp.mock.calls[0][0]).not.toHaveProperty('image');
  });
});
