import { useEffect } from 'react';
import { userManager } from './user-manager';

/**
 * The page the renewal iframe lands on. It hands the code back to the parent
 * window and renders nothing -- the frame is hidden and torn down as soon as
 * oidc-client-ts resolves the promise.
 *
 * It has to render before AuthGate, not inside it: the frame would otherwise run
 * the whole sign-in flow again in its own context.
 */
export function SilentRenewCallback() {
  useEffect(() => {
    if (!userManager) return;
    userManager.signinSilentCallback().catch((error) => {
      // The parent already sees this as a rejected renewal and falls back to a
      // redirect, so there is nothing to do here but leave a trace.
      console.warn('[auth] silent renew callback failed', error);
    });
  }, []);

  return null;
}
