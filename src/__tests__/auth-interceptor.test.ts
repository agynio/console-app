import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createContextValues } from '@connectrpc/connect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersGateway } from '@/gen/agynio/api/gateway/v1/users_pb';
import { authInterceptor } from '@/auth/auth-interceptor';

const { getAccessToken, signinSilent } = vi.hoisted(() => ({
  getAccessToken: vi.fn<[], Promise<string | null>>(),
  signinSilent: vi.fn(),
}));

vi.mock('@/auth/user-manager', () => ({
  getAccessToken,
  userManager: {
    signinSilent,
  },
}));

function makeRequest() {
  return {
    stream: false as const,
    service: UsersGateway,
    method: UsersGateway.method.getMe,
    message: create(UsersGateway.method.getMe.input, {}),
    url: '/api/agynio.api.gateway.v1.UsersGateway/GetMe',
    signal: new AbortController().signal,
    header: new Headers(),
    contextValues: createContextValues(),
    requestMethod: 'POST',
  };
}

function makeResponse() {
  return {
    stream: false as const,
    service: UsersGateway,
    method: UsersGateway.method.getMe,
    message: create(UsersGateway.method.getMe.output, {}),
    header: new Headers(),
    trailer: new Headers(),
  };
}

describe('auth interceptor', () => {
  beforeEach(() => {
    getAccessToken.mockReset();
    signinSilent.mockReset();
  });

  it('injects the bearer token when available', async () => {
    getAccessToken.mockResolvedValue('token-123');
    const next = vi.fn(async (req) => {
      expect(req.header.get('Authorization')).toBe('Bearer token-123');
      return makeResponse();
    });

    await authInterceptor(next)(makeRequest());

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('renews on unauthenticated responses and retries once', async () => {
    getAccessToken.mockResolvedValueOnce('stale-token').mockResolvedValueOnce('fresh-token');
    const next = vi
      .fn()
      .mockRejectedValueOnce(new ConnectError('unauthorized', Code.Unauthenticated))
      .mockResolvedValueOnce(makeResponse());

    await authInterceptor(next)(makeRequest());

    expect(signinSilent).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
    const retriedRequest = next.mock.calls[1][0];
    expect(retriedRequest.header.get('Authorization')).toBe('Bearer fresh-token');
  });

  it('does not retry more than once on repeated unauthenticated errors', async () => {
    getAccessToken.mockResolvedValueOnce('stale-token').mockResolvedValueOnce('fresh-token');
    const next = vi
      .fn()
      .mockRejectedValueOnce(new ConnectError('unauthorized', Code.Unauthenticated))
      .mockRejectedValueOnce(new ConnectError('unauthorized', Code.Unauthenticated));

    await expect(authInterceptor(next)(makeRequest())).rejects.toThrow('unauthorized');

    expect(signinSilent).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
