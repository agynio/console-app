import { useCallback, useMemo, useRef, useState } from 'react';
import type { Runtime, SetupPath } from './catalog';

export type StepId = 'path' | 'environment' | 'llm' | 'tools' | 'target';

export type SetupState = {
  path: SetupPath | null;
  runtime: Runtime;
  /** Committed by step 1. Everything after it attaches to this environment. */
  environmentId: string;
  environmentName: string;
  /** Derived from how the organization pays, and never shown as a mode. */
  llmMode: 'platform' | 'native';
  /** Set on the API-key branch only; native mode has no platform model. */
  modelId: string;
  modelName: string;
  agentId: string;
  agentName: string;
  /** The conversation the finish overlay sends the user to on the agent path. */
  chatId: string;
  sandboxId: string;
  sandboxName: string;
};

const INITIAL: SetupState = {
  path: null,
  runtime: 'claude',
  environmentId: '',
  environmentName: '',
  llmMode: 'platform',
  modelId: '',
  modelName: '',
  agentId: '',
  agentName: '',
  chatId: '',
  sandboxId: '',
  sandboxName: '',
};

const STEP_LABELS: Record<StepId, string> = {
  path: 'Start',
  environment: 'Environment',
  llm: 'Model access',
  tools: 'Tools',
  target: 'Finish setup',
};

/** The steps a path runs. A tool has no thread to serve without an agent. */
function stepsFor(path: SetupPath | null): StepId[] {
  if (path === 'sandbox') return ['path', 'environment', 'llm', 'target'];
  return ['path', 'environment', 'llm', 'tools', 'target'];
}

export type SetupWizard = {
  state: SetupState;
  steps: { id: StepId; label: string }[];
  step: StepId;
  stepIndex: number;
  /** Records an answer without leaving the step that asked it. */
  patch: (values: Partial<SetupState>) => void;
  /** Records what the step created and opens the next one, in one move. */
  advance: (values?: Partial<SetupState>) => void;
  /** True once the last step has committed and the overlay is up. */
  finished: boolean;
};

/**
 * The wizard's run. Nothing here is persisted: every step commits real resources
 * as it goes, so a reload loses the run but not the work, and re-entry from the
 * Overview starts a fresh one.
 */
export function useSetupWizard(): SetupWizard {
  const [state, setState] = useState<SetupState>(INITIAL);
  const [step, setStep] = useState<StepId>('path');
  const [finished, setFinished] = useState(false);

  // The step list depends on an answer given by a step, so advancing reads the
  // value the same call just recorded rather than last render's copy.
  const stateRef = useRef(state);
  const stepRef = useRef(step);

  const patch = useCallback((values: Partial<SetupState>) => {
    const merged = { ...stateRef.current, ...values };
    stateRef.current = merged;
    setState(merged);
  }, []);

  const advance = useCallback((values?: Partial<SetupState>) => {
    const merged = values ? { ...stateRef.current, ...values } : stateRef.current;
    stateRef.current = merged;
    setState(merged);

    const ids = stepsFor(merged.path);
    const next = ids[ids.indexOf(stepRef.current) + 1];
    if (!next) {
      setFinished(true);
      return;
    }
    stepRef.current = next;
    setStep(next);
  }, []);

  const stepIds = useMemo(() => stepsFor(state.path), [state.path]);
  const steps = useMemo(() => stepIds.map((id) => ({ id, label: STEP_LABELS[id] })), [stepIds]);

  return {
    state,
    steps,
    step,
    stepIndex: stepIds.indexOf(step),
    patch,
    advance,
    finished,
  };
}
