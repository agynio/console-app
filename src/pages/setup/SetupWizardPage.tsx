import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useSetupOverlay } from '@/context/SetupOverlayContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { markSetupSkipped } from './skipped';
import { SetupStepper } from './SetupStepper';
import { StepChoosePath } from './StepChoosePath';
import { StepEnvironment } from './StepEnvironment';
import { StepTools } from './StepTools';
import { StepLlm } from './StepLlm';
import { StepTarget } from './StepTarget';
import { useSetupWizard } from './useSetupWizard';

/**
 * Builds a new organization's first working setup. Every resource it creates is
 * an ordinary one, made through the same APIs every other surface uses — nothing
 * here is privileged, and everything it produces is editable afterwards in the
 * section it came from.
 */
export function SetupWizardPage() {
  useDocumentTitle('Set up');

  const { id } = useParams();
  const organizationId = id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setFinish } = useSetupOverlay();
  const { state, steps, step, stepIndex, patch, advance, finished } = useSetupWizard();

  const leave = () => {
    // What the run created is real, and the Console is about to show it.
    void queryClient.invalidateQueries();
    navigate(`/organizations/${organizationId}`);
  };

  const skip = () => {
    // Remembered, or the Overview would send an empty organization straight
    // back here and there would be no way out.
    markSetupSkipped(organizationId);
    leave();
  };

  // The overlay dims the ordinary Console rather than the wizard, so the run
  // ends by handing its result to the layout and stepping off the route.
  useEffect(() => {
    if (!finished) return;
    setFinish({ organizationId, state });
    leave();
    // Only the transition matters; `leave` and `state` are stable by then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <div className="flex items-center justify-between gap-4">
        <SetupStepper steps={steps} current={stepIndex} />
        <Button variant="ghost" size="sm" onClick={skip} data-testid="setup-dismiss">
          Skip setup
        </Button>
      </div>

      {step === 'path' ? (
        <StepChoosePath value={state.path} onChoose={(path) => advance({ path })} />
      ) : null}

      {step === 'environment' ? (
        <StepEnvironment
          organizationId={organizationId}
          runtime={state.runtime}
          onRuntimeChange={(runtime) => patch({ runtime })}
          onDone={(values) => advance(values)}
        />
      ) : null}

      {step === 'llm' && state.path ? (
        <StepLlm
          organizationId={organizationId}
          path={state.path}
          runtime={state.runtime}
          environmentId={state.environmentId}
          onDone={(values) => advance(values)}
        />
      ) : null}

      {step === 'tools' ? (
        <StepTools
          organizationId={organizationId}
          environmentId={state.environmentId}
          onDone={() => advance()}
        />
      ) : null}

      {step === 'target' && state.path ? (
        <StepTarget
          organizationId={organizationId}
          path={state.path}
          environmentId={state.environmentId}
          environmentName={state.environmentName}
          llmMode={state.llmMode}
          modelId={state.modelId}
          modelName={state.modelName}
          onDone={(values) => advance(values)}
        />
      ) : null}
    </div>
  );
}
