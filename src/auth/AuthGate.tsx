import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { Button } from '@/components/ui/button';
import { oidcConfig } from '@/config';
import { clearSignedOutFlag, readSignedOutFlag } from './signed-out';
import { userManager } from './user-manager';

type AuthGateProps = {
  children: ReactNode;
};

function handleSigninCallback() {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  const cleanedUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, cleanedUrl);
}

function hasAuthParams(location = window.location): boolean {
  let searchParams = new URLSearchParams(location.search);
  if ((searchParams.get('code') || searchParams.get('error')) && searchParams.get('state')) {
    return true;
  }

  searchParams = new URLSearchParams(location.hash.replace('#', '?'));
  if ((searchParams.get('code') || searchParams.get('error')) && searchParams.get('state')) {
    return true;
  }

  return false;
}

function SignedOutScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <div className="rounded-lg border bg-background px-6 py-5 text-center shadow-sm">
        <div className="text-sm font-medium text-foreground">You have signed out.</div>
        <div className="mt-1 text-xs text-muted-foreground">Sign back in to continue.</div>
        <Button className="mt-4" size="sm" onClick={onSignIn}>
          Sign in
        </Button>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [signedOut, setSignedOut] = useState(() => readSignedOutFlag());

  const handleSignIn = useCallback(() => {
    clearSignedOutFlag();
    setSignedOut(false);
    void auth.signinRedirect();
  }, [auth]);

  useEffect(() => {
    if (!signedOut || !auth.isAuthenticated) return;
    clearSignedOutFlag();
    setSignedOut(false);
  }, [auth.isAuthenticated, signedOut]);

  useEffect(() => {
    if (signedOut) return;
    if (auth.isLoading || auth.activeNavigator || auth.isAuthenticated) return;
    if (hasAuthParams()) return;
    void auth.signinRedirect();
  }, [auth, signedOut]);

  if (signedOut && !auth.isAuthenticated) {
    return <SignedOutScreen onSignIn={handleSignIn} />;
  }

  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 text-sm text-muted-foreground">
        Loading console...
      </div>
    );
  }

  return <>{children}</>;
}

function AuthErrorBoundary({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.error) {
    throw new Error(`OIDC authentication failed: ${auth.error.message}`);
  }
  return <>{children}</>;
}

export function AuthGate({ children }: AuthGateProps) {
  if (!oidcConfig.enabled) return <>{children}</>;
  if (!userManager) throw new Error('auth: user manager not initialized');

  return (
    <AuthProvider userManager={userManager} onSigninCallback={handleSigninCallback}>
      <AuthErrorBoundary>
        <RequireAuth>{children}</RequireAuth>
      </AuthErrorBoundary>
    </AuthProvider>
  );
}
