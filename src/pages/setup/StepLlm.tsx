import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ConnectError } from '@connectrpc/connect';
import { agentsClient, llmClient, secretsClient } from '@/api/client';
import { ChoiceCard } from '@/components/ChoiceCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EnvironmentAvailability, LLMMode } from '@/gen/agynio/api/agents/v1/agents_pb';
import { Vendor } from '@/gen/agynio/api/llm/v1/llm_pb';
import { BadgeCheckIcon, KeyIcon, TerminalIcon } from 'lucide-react';
import {
  RUNTIMES,
  SUBSCRIPTION_TOKEN_HELP,
  presetEndpoint,
  presetsFor,
  protocolPath,
  type Runtime,
  type SetupPath,
  type VendorPreset,
} from './catalog';

type StepLlmProps = {
  organizationId: string;
  path: SetupPath;
  runtime: Runtime;
  environmentId: string;
  onDone: (values: {
    llmMode: 'platform' | 'native';
    modelId: string;
    modelName: string;
  }) => void;
};

type Branch = 'subscription' | 'api-key';

/** The vendors whose consumer plan covers an autonomous agent, not just a person at a keyboard. */
const AGENT_SAFE_SUBSCRIPTION: Vendor[] = [Vendor.OPENAI];

export function StepLlm({ organizationId, path, runtime, environmentId, onDone }: StepLlmProps) {
  const vendor = RUNTIMES.find((entry) => entry.id === runtime)?.vendor ?? Vendor.ANTHROPIC;
  const runtimeLabel = RUNTIMES.find((entry) => entry.id === runtime)?.label ?? '';

  // A subscription is a consumer plan, and the vendors differ on whether one
  // covers an autonomous agent. The platform does not enforce it — it cannot
  // tell the two uses apart — so the surface that offers the choice states it.
  const subscriptionOffered = path === 'sandbox' || AGENT_SAFE_SUBSCRIPTION.includes(vendor);

  const tokenHelp = SUBSCRIPTION_TOKEN_HELP[vendor];
  const presets = useMemo(() => presetsFor(runtime), [runtime]);
  const [branch, setBranch] = useState<Branch>(subscriptionOffered ? 'subscription' : 'api-key');
  const [presetId, setPresetId] = useState(presets[0]?.id ?? '');
  const preset = presets.find((entry) => entry.id === presetId) ?? presets[0];

  const [endpointInput, setEndpointInput] = useState('');
  const [token, setToken] = useState('');
  const [remoteName, setRemoteName] = useState(preset?.remoteName ?? '');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [verified, setVerified] = useState('');

  // Kept so a failed credential is corrected in place rather than by creating a
  // second provider beside the first.
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');

  const selectPreset = (next: VendorPreset) => {
    setPresetId(next.id);
    setRemoteName(next.remoteName);
    setEndpointInput('');
    setError('');
  };

  const apiKey = useMutation({
    mutationFn: async () => {
      const endpoint = preset ? presetEndpoint(preset, endpointInput) : '';
      if (!endpoint) throw new Error('An endpoint is required.');
      if (!token.trim()) throw new Error('An API key is required.');
      if (!remoteName.trim()) throw new Error('A model name is required.');

      let provider = providerId;
      if (provider) {
        await llmClient.updateLLMProvider({ id: provider, token: token.trim() });
      } else {
        const created = await llmClient.createLLMProvider({
          organizationId,
          endpoint,
          protocol: preset.protocol,
          authMethod: preset.authMethod,
          token: token.trim(),
        });
        provider = created.provider?.meta?.id ?? '';
        if (!provider) throw new Error('Provider created but missing ID.');
        setProviderId(provider);
      }

      let model = modelId;
      if (!model) {
        const created = await llmClient.createModel({
          organizationId,
          name: remoteName.trim(),
          llmProviderId: provider,
          remoteName: remoteName.trim(),
        });
        model = created.model?.meta?.id ?? '';
        if (!model) throw new Error('Model created but missing ID.');
        setModelId(model);
      }

      // The same call the model test dialog makes. A wizard that accepts a bad
      // key fails two screens away from its cause, in an app the user has never
      // seen before.
      const test = await llmClient.testModel({ modelId: model });
      const output = test.outputText?.trim() ?? '';
      if (!output) throw new Error('The provider answered with nothing.');
      return { model, output };
    },
    onSuccess: ({ model, output }) => {
      setVerified(output);
      setError('');
      onDone({ llmMode: 'platform', modelId: model, modelName: remoteName.trim() });
    },
    onError: (cause) => {
      setVerified('');
      setError(cause instanceof ConnectError ? cause.message : (cause as Error).message);
    },
  });

  const subscription = useMutation({
    mutationFn: async () => {
      if (!token.trim()) throw new Error('A token is required.');

      const secret = await secretsClient.createSecret({
        organizationId,
        title: `${runtimeLabel} subscription token`,
        description: 'Subscription token',
        value: token.trim(),
      });
      const secretId = secret.secret?.meta?.id ?? '';
      if (!secretId) throw new Error('Secret created but missing ID.');

      const created = await llmClient.createSubscription({
        organizationId,
        name: `${runtimeLabel} plan`,
        vendor,
        secretId,
        accountId: accountId.trim(),
      });
      const subscriptionId = created.subscription?.meta?.id ?? '';
      if (!subscriptionId) throw new Error('Subscription created but missing ID.');

      await llmClient.createSubscriptionAttachment({
        subscriptionId,
        target: { case: 'environmentId', value: environmentId },
      });

      // Legal precisely here: the mode is frozen only once an agent references
      // the environment, and none exists yet on either path. Private, because an
      // internal environment would make one person's plan an organization-wide
      // credential the moment a second member joined.
      await agentsClient.updateEnvironment({
        id: environmentId,
        llmMode: LLMMode.LLM_MODE_NATIVE,
        availability: EnvironmentAvailability.PRIVATE,
      });
    },
    onSuccess: () => {
      setError('');
      onDone({ llmMode: 'native', modelId: '', modelName: '' });
    },
    onError: (cause) => {
      setError(cause instanceof ConnectError ? cause.message : (cause as Error).message);
    },
  });

  const pending = apiKey.isPending || subscription.isPending;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">How you pay for models</h2>
        <p className="text-sm text-muted-foreground">
          {runtimeLabel} needs a way to call a model. Both routes go through the platform, so usage is
          metered and guardrails apply either way.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Shown even where it cannot be taken. The platform has two routes, and
            a reader who never sees the second one does not learn that — nor why
            this path is the exception. */}
        <ChoiceCard
          title={`${runtimeLabel} plan`}
          description="Use a plan you already pay for. The token stays in the platform — a shell in the workload cannot read it."
          icon={BadgeCheckIcon}
          selected={subscriptionOffered && branch === 'subscription'}
          onSelect={() => {
            setBranch('subscription');
            setError('');
          }}
          disabled={pending || !subscriptionOffered}
          unavailableReason={
            subscriptionOffered ? undefined : (
              <span data-testid="setup-llm-subscription-excluded">
                Not available here: Anthropic&apos;s terms don&apos;t cover autonomous agents on a
                Claude subscription.
              </span>
            )
          }
          data-testid="setup-llm-subscription"
        />
        <ChoiceCard
          title="API key"
          description="Use a vendor API key. You get the platform's model catalog, per-model access, and token accounting."
          icon={KeyIcon}
          selected={branch === 'api-key'}
          onSelect={() => {
            setBranch('api-key');
            setError('');
          }}
          disabled={pending}
          data-testid="setup-llm-api-key"
        />
      </div>

      {branch === 'api-key' ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Vendor</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {presets.map((entry) => (
                <ChoiceCard
                  key={entry.id}
                  title={entry.label}
                  description={
                    entry.custom
                      ? 'Anything else that speaks this protocol — a gateway, a proxy, your own endpoint.'
                      : entry.endpoint ?? 'Your own resource endpoint.'
                  }
                  selected={preset?.id === entry.id}
                  onSelect={() => selectPreset(entry)}
                  disabled={pending}
                  data-testid={`setup-llm-vendor-${entry.id}`}
                />
              ))}
            </div>
          </div>

          {preset?.endpointTemplate ? (
            <div className="space-y-2">
              <Label htmlFor="setup-llm-endpoint">{preset.endpointTemplate.label}</Label>
              <Input
                id="setup-llm-endpoint"
                value={endpointInput}
                onChange={(event) => setEndpointInput(event.target.value)}
                placeholder={preset.endpointTemplate.placeholder}
                data-testid="setup-llm-endpoint"
              />
              <p className="text-xs text-muted-foreground">
                {presetEndpoint(preset, endpointInput || preset.endpointTemplate.placeholder)}
              </p>
            </div>
          ) : null}

          {preset?.custom ? (
            <div className="space-y-2">
              <Label htmlFor="setup-llm-endpoint-custom">Endpoint</Label>
              <Input
                id="setup-llm-endpoint-custom"
                value={endpointInput}
                onChange={(event) => setEndpointInput(event.target.value)}
                placeholder={preset.endpointPlaceholder}
                data-testid="setup-llm-endpoint-custom"
              />
              <p className="text-xs text-muted-foreground">
                The full URL requests are posted to, including its path — {runtimeLabel} speaks{' '}
                <code className="font-mono">{protocolPath(preset.protocol)}</code>.
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="setup-llm-token">API key</Label>
            <Input
              id="setup-llm-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="sk-…"
              data-testid="setup-llm-token"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="setup-llm-model">Model</Label>
            <Input
              id="setup-llm-model"
              value={remoteName}
              onChange={(event) => setRemoteName(event.target.value)}
              placeholder="The vendor's model name"
              data-testid="setup-llm-model"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="space-y-2">
            <Label htmlFor="setup-subscription-token">Token</Label>
            <Input
              id="setup-subscription-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="sk-ant-oat01-…"
              data-testid="setup-subscription-token"
            />
          </div>
          {vendor === Vendor.OPENAI ? (
            <div className="space-y-2">
              <Label htmlFor="setup-subscription-account">Account ID</Label>
              <Input
                id="setup-subscription-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                data-testid="setup-subscription-account"
              />
            </div>
          ) : null}
          {/* Getting the token is the one part of this the platform cannot do,
              which is why the step that asks for it says where to look. */}
          {tokenHelp ? (
            <div className="flex items-start gap-2" data-testid="setup-subscription-help">
              <TerminalIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {tokenHelp.command ? (
                  <>
                    <code className="font-mono text-foreground">{tokenHelp.command}</code>{' '}
                  </>
                ) : null}
                {tokenHelp.body}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {verified ? (
        <p className="text-sm text-muted-foreground" data-testid="setup-llm-verified">
          The model answered: {verified}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" data-testid="setup-llm-error">
          {error}
        </p>
      ) : null}

      <Button
        onClick={() => {
          setError('');
          if (branch === 'api-key') apiKey.mutate();
          else subscription.mutate();
        }}
        disabled={pending}
        data-testid="setup-llm-submit"
      >
        {branch === 'api-key'
          ? apiKey.isPending
            ? 'Checking the key…'
            : 'Check and continue'
          : subscription.isPending
            ? 'Saving…'
            : 'Continue'}
      </Button>
    </div>
  );
}
