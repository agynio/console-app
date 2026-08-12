import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product } from './products';

type WindowStub = {
  location: { protocol: string; hostname: string; port: string };
  __ENV__: Record<string, string>;
};

function stubWindow(url: string, env: Record<string, string> = {}): void {
  const parsed = new URL(url);
  const stub: WindowStub = {
    location: { protocol: parsed.protocol, hostname: parsed.hostname, port: parsed.port },
    __ENV__: env,
  };
  vi.stubGlobal('window', stub as unknown as Window);
}

async function loadProducts() {
  vi.resetModules();
  const { PRODUCTS, productUrl } = await import('./products');
  return { PRODUCTS, productUrl };
}

function product(id: string, products: Product[]): Product {
  return products.find((entry) => entry.id === id)!;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('productUrl', () => {
  it('derives a sibling host when nothing is configured', async () => {
    stubWindow('https://console.agyn.dev');
    const { PRODUCTS, productUrl } = await loadProducts();
    expect(productUrl(product('chat', PRODUCTS))).toBe('https://chat.agyn.dev');
  });

  // Hosts that do not split at the first label used to derive a stranger.
  it('uses the configured address instead of guessing', async () => {
    stubWindow('https://console-agyn.example.com', {
      CHAT_URL: 'https://chat-agyn.example.com',
      SANDBOXES_URL: 'https://sandboxes-agyn.example.com',
    });
    const { PRODUCTS, productUrl } = await loadProducts();
    expect(productUrl(product('chat', PRODUCTS))).toBe('https://chat-agyn.example.com');
    expect(productUrl(product('sandboxes', PRODUCTS))).toBe('https://sandboxes-agyn.example.com');
  });

  it('falls back to derivation for products left unconfigured', async () => {
    stubWindow('https://console.agyn.dev', { CHAT_URL: 'https://chat-agyn.example.com' });
    const { PRODUCTS, productUrl } = await loadProducts();
    expect(productUrl(product('tracing', PRODUCTS))).toBe('https://tracing.agyn.dev');
  });

  it('ignores blank values so an empty env var does not win', async () => {
    stubWindow('https://console.agyn.dev', { CHAT_URL: '   ' });
    const { PRODUCTS, productUrl } = await loadProducts();
    expect(productUrl(product('chat', PRODUCTS))).toBe('https://chat.agyn.dev');
  });

  it('drops a trailing slash so callers can append a path', async () => {
    stubWindow('https://console.agyn.dev', { CHAT_URL: 'https://chat-agyn.example.com/' });
    const { PRODUCTS, productUrl } = await loadProducts();
    expect(productUrl(product('chat', PRODUCTS))).toBe('https://chat-agyn.example.com');
  });
});
