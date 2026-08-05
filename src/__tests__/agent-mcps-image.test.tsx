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
        create(ImageSchema, {
          meta: create(ImageEntityMetaSchema, { id: 'image-10' }),
          organizationId: 'org-1',
          name: 'mcp-gitlab',
          type: ImageType.MCP,
        }),
      ],
      nextPageToken: '',
    });
    refreshImage.mockImplementation(({ imageId }: { imageId: string }) =>
      Promise.resolve({
        versions:
          imageId === 'image-10'
            ? [create(ImageVersionSchema, { tag: '3.1.0' })]
            : [create(ImageVersionSchema, { tag: '2.0.0' }), create(ImageVersionSchema, { tag: '1.0.0' })],
      }),
    );
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

  // Choosing a different image has to bring its own versions with it: the
  // second choice left the version list empty.
  it('offers the new image versions when the image is changed', async () => {
    renderTab();
    fireEvent.click(await screen.findByTestId('agent-mcps-create'));

    const version = () => screen.getByTestId('agent-mcps-create-version') as HTMLInputElement;

    fireEvent.click(screen.getByTestId('agent-mcps-create-image-toggle'));
    fireEvent.click(await screen.findByTestId('agent-mcps-create-image-option-mcp-github'));
    await waitFor(() => expect(version().value).toBe('2.0.0'));

    fireEvent.click(screen.getByTestId('agent-mcps-create-image-toggle'));
    fireEvent.click(await screen.findByTestId('agent-mcps-create-image-option-mcp-gitlab'));

    await waitFor(() => expect(version().value).toBe('3.1.0'));
    fireEvent.focus(version());
    expect(await screen.findByTestId('agent-mcps-create-version-option-3.1.0')).toBeTruthy();
  });

  // The platform's own devcontainer publishes only sha-, tmp- and latest tags.
  // Holding non-semver tags behind "show all" left that image with an empty
  // version list and no way to see it was not broken.
  it('lists the tags a repository has when none of them are semver', async () => {
    refreshImage.mockResolvedValue({
      versions: [create(ImageVersionSchema, { tag: 'sha-8ff09f8' }), create(ImageVersionSchema, { tag: 'latest' })],
    });
    renderTab();
    fireEvent.click(await screen.findByTestId('agent-mcps-create'));

    fireEvent.click(screen.getByTestId('agent-mcps-create-image-toggle'));
    fireEvent.click(await screen.findByTestId('agent-mcps-create-image-option-mcp-github'));

    fireEvent.focus(screen.getByTestId('agent-mcps-create-version'));
    expect(await screen.findByTestId('agent-mcps-create-version-option-sha-8ff09f8')).toBeTruthy();
    expect(screen.getByTestId('agent-mcps-create-version-option-latest')).toBeTruthy();
    // Nothing is being held back, so there is nothing to reveal.
    expect(screen.queryByTestId('agent-mcps-create-show-all-tags')).toBeNull();
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
