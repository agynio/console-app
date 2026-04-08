import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PageTitleProvider, usePageTitle, useSetPageTitle } from '@/context/PageTitleContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

function TitleReader() {
  const title = usePageTitle();
  return <div data-testid="title">{title}</div>;
}

function TitleUpdater() {
  const title = usePageTitle();
  const setTitle = useSetPageTitle();

  return (
    <div>
      <div data-testid="title">{title}</div>
      <button type="button" onClick={() => setTitle('Dashboard')} data-testid="set-title">
        Set title
      </button>
    </div>
  );
}

type DocumentTitleProbeProps = {
  title: string;
};

function DocumentTitleProbe({ title }: DocumentTitleProbeProps) {
  useDocumentTitle(title);
  const currentTitle = usePageTitle();
  return <div data-testid="title">{currentTitle}</div>;
}

describe('PageTitleContext', () => {
  afterEach(() => {
    cleanup();
  });

  it('provides an empty title by default', () => {
    render(
      <PageTitleProvider>
        <TitleReader />
      </PageTitleProvider>,
    );

    expect(screen.getByTestId('title').textContent).toBe('');
  });

  it('updates the title when the setter is called', async () => {
    render(
      <PageTitleProvider>
        <TitleUpdater />
      </PageTitleProvider>,
    );

    fireEvent.click(screen.getByTestId('set-title'));

    await waitFor(() => {
      expect(screen.getByTestId('title').textContent).toBe('Dashboard');
    });
  });

  it('updates the title when useDocumentTitle changes', async () => {
    const { rerender } = render(
      <PageTitleProvider>
        <DocumentTitleProbe title="Initial" />
      </PageTitleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('title').textContent).toBe('Initial');
    });

    rerender(
      <PageTitleProvider>
        <DocumentTitleProbe title="Updated" />
      </PageTitleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('title').textContent).toBe('Updated');
    });
  });

  it('throws when usePageTitle is used outside the provider', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TitleReader />)).toThrowError('usePageTitle must be used within PageTitleProvider');

    errorSpy.mockRestore();
  });

  it('throws when useSetPageTitle is used outside the provider', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function TitleSetter() {
      const setTitle = useSetPageTitle();
      return (
        <button type="button" onClick={() => setTitle('Dashboard')}>
          Set title
        </button>
      );
    }

    expect(() => render(<TitleSetter />)).toThrowError('useSetPageTitle must be used within PageTitleProvider');

    errorSpy.mockRestore();
  });
});
