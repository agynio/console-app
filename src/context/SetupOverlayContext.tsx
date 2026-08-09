/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';
import type { SetupState } from '@/pages/setup/useSetupWizard';

export type SetupFinish = {
  organizationId: string;
  state: SetupState;
};

type SetupOverlayContextValue = {
  /** Set once the wizard's last step commits; cleared when the overlay is dismissed. */
  finish: SetupFinish | null;
  setFinish: (finish: SetupFinish | null) => void;
};

const SetupOverlayContext = createContext<SetupOverlayContextValue | null>(null);

/**
 * Carries the finished run out of the wizard and into the layout. The overlay
 * belongs there rather than in the wizard: it dims the ordinary Console and
 * drives the product switcher, neither of which the wizard's own page owns.
 */
export function SetupOverlayProvider({ children }: { children: ReactNode }) {
  const [finish, setFinish] = useState<SetupFinish | null>(null);
  const value = useMemo(() => ({ finish, setFinish }), [finish]);
  return <SetupOverlayContext.Provider value={value}>{children}</SetupOverlayContext.Provider>;
}

export function useSetupOverlay(): SetupOverlayContextValue {
  return useContext(SetupOverlayContext) ?? { finish: null, setFinish: () => {} };
}
