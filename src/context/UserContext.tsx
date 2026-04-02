/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { usersClient } from '@/api/client';
import { oidcConfig } from '@/config';
import type { User } from '@/gen/agynio/api/users/v1/users_pb';
import { ClusterRole } from '@/gen/agynio/api/users/v1/users_pb';

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  nickname: string;
  photoUrl: string;
  oidcSubject: string;
};

type UserContextValue = {
  currentUser: CurrentUser | null;
  clusterRole: ClusterRole | null;
  identityId: string | null;
  isClusterAdmin: boolean;
  status: 'loading' | 'ready' | 'error';
  error: Error | null;
  signOut: () => void;
};

const UserContext = createContext<UserContextValue | null>(null);

function buildCurrentUser(user?: User): CurrentUser | null {
  if (!user) return null;
  return {
    id: user.meta?.id ?? '',
    name: user.name,
    email: user.email,
    nickname: user.nickname,
    photoUrl: user.photoUrl,
    oidcSubject: user.oidcSubject,
  };
}

function OidcUserProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const accessToken = auth.user?.access_token ?? null;
  const queryEnabled = auth.isAuthenticated && Boolean(accessToken);

  const meQuery = useQuery({
    queryKey: ['users', 'me', accessToken],
    queryFn: () => usersClient.getMe({}),
    enabled: queryEnabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const authError = auth.error ? new Error(auth.error.message) : null;
  const error = authError ?? meQuery.error ?? null;
  const status: UserContextValue['status'] = auth.isLoading || meQuery.isPending
    ? 'loading'
    : error
      ? 'error'
      : 'ready';

  const currentUser = buildCurrentUser(meQuery.data?.user);
  const clusterRole = meQuery.data?.clusterRole ?? null;
  const identityId = meQuery.data?.user?.meta?.id ?? null;
  const isClusterAdmin = clusterRole === ClusterRole.ADMIN;

  const value: UserContextValue = {
    currentUser,
    clusterRole,
    identityId,
    isClusterAdmin,
    status,
    error,
    signOut: () => void auth.signoutRedirect(),
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function UserProvider({ children }: { children: ReactNode }) {
  if (!oidcConfig.enabled) {
    const value: UserContextValue = {
      currentUser: null,
      clusterRole: null,
      identityId: null,
      isClusterAdmin: false,
      status: 'ready',
      error: null,
      signOut: () => undefined,
    };
    return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
  }

  return <OidcUserProvider>{children}</OidcUserProvider>;
}

export function useUserContext() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUserContext must be used within UserProvider');
  }
  return ctx;
}
