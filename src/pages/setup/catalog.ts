import type { Image, ImageVersion } from '@/gen/agynio/api/images/v1/images_pb';
import type { Runner } from '@/gen/agynio/api/runners/v1/runners_pb';
import { AuthMethod, Protocol, Vendor } from '@/gen/agynio/api/llm/v1/llm_pb';
import { groupVersions } from '@/lib/image-versions';

/** What the agent CLI is. Selected on step 1, and decides the LLM step's presets. */
export type Runtime = 'claude' | 'codex';

/** What the wizard finishes with. Its only payload is whether a subscription may be offered. */
export type SetupPath = 'agent' | 'sandbox';

export type RuntimeOption = {
  id: Runtime;
  label: string;
  description: string;
  /** Name of the platform's agent_runtime image for this CLI. */
  imageName: string;
  /** The protocol its vendor's API speaks, which filters the vendor presets. */
  protocol: Protocol;
  vendor: Vendor;
};

export const RUNTIMES: RuntimeOption[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    description: "Anthropic's agent CLI.",
    imageName: 'claude',
    protocol: Protocol.ANTHROPIC_MESSAGES,
    vendor: Vendor.ANTHROPIC,
  },
  {
    id: 'codex',
    label: 'Codex',
    description: "OpenAI's agent CLI.",
    imageName: 'codex',
    protocol: Protocol.RESPONSES,
    vendor: Vendor.OPENAI,
  },
];

/**
 * Where an operator actually gets the token for a vendor's consumer plan.
 * Obtaining one is out of the platform's hands, which is exactly why the step
 * that asks for it should say where to look.
 */
export const SUBSCRIPTION_TOKEN_HELP: Partial<Record<Vendor, { command?: string; body: string }>> = {
  [Vendor.ANTHROPIC]: {
    command: 'claude setup-token',
    body: 'Run this on a machine where Claude Code is signed in, then paste the sk-ant- token it prints.',
  },
  [Vendor.OPENAI]: {
    body: 'Sign in with the Codex CLI, then copy the token from ~/.codex/auth.json.',
  },
};

export type VendorPreset = {
  id: string;
  label: string;
  protocol: Protocol;
  authMethod: AuthMethod;
  /**
   * The full upstream URL, not a base: the LLM Proxy and the model test both POST
   * to the provider's endpoint verbatim and append no path of their own.
   */
  endpoint: string | null;
  /** Set when the endpoint carries a customer-specific segment the user must fill in. */
  endpointTemplate?: { prefix: string; suffix: string; label: string; placeholder: string };
  /** Shown in the free-text endpoint field. Protocol-specific, so it is filled in per runtime. */
  endpointPlaceholder?: string;
  /** The vendor's current recommended model for this CLI. Content, not contract. */
  remoteName: string;
  modelName: string;
  /** Free text endpoint and a protocol the caller picks. */
  custom?: boolean;
};

export const VENDOR_PRESETS: VendorPreset[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    protocol: Protocol.ANTHROPIC_MESSAGES,
    authMethod: AuthMethod.X_API_KEY,
    endpoint: 'https://api.anthropic.com/v1/messages',
    remoteName: 'claude-opus-5',
    modelName: 'claude-opus-5',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: Protocol.RESPONSES,
    authMethod: AuthMethod.BEARER,
    endpoint: 'https://api.openai.com/v1/responses',
    remoteName: 'gpt-5-codex',
    modelName: 'gpt-5-codex',
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    protocol: Protocol.RESPONSES,
    authMethod: AuthMethod.BEARER,
    // The resource name is the customer's; the surface must be /openai/v1, since
    // the classic ?api-version= path is not what the proxy posts to.
    endpoint: null,
    endpointTemplate: {
      prefix: 'https://',
      suffix: '.openai.azure.com/openai/v1/responses',
      label: 'Resource name',
      placeholder: 'my-resource',
    },
    remoteName: 'gpt-5-codex',
    modelName: 'gpt-5-codex',
  },
  {
    id: 'custom',
    label: 'Custom',
    protocol: Protocol.RESPONSES,
    authMethod: AuthMethod.BEARER,
    endpoint: null,
    remoteName: '',
    modelName: '',
    custom: true,
  },
];

/** The path the proxy posts to, which is what a custom endpoint has to end in. */
export function protocolPath(protocol: Protocol): string {
  return protocol === Protocol.ANTHROPIC_MESSAGES ? '/v1/messages' : '/v1/responses';
}

/**
 * Presets that can serve the CLI the environment step selected. Custom takes
 * the runtime's protocol rather than one of its own: the proxy rejects a
 * request whose caller path and provider protocol disagree, so a custom
 * provider built on the wrong one could never answer a call.
 */
export function presetsFor(runtime: Runtime): VendorPreset[] {
  const protocol = RUNTIMES.find((entry) => entry.id === runtime)?.protocol ?? Protocol.RESPONSES;
  return VENDOR_PRESETS.filter((preset) => preset.custom || preset.protocol === protocol).map(
    (preset) =>
      preset.custom
        ? {
            ...preset,
            protocol,
            endpointPlaceholder: `https://gateway.example.com${protocolPath(protocol)}`,
          }
        : preset,
  );
}

/** Resolves a preset's endpoint, filling a template with what the user typed. */
export function presetEndpoint(preset: VendorPreset, input: string): string {
  if (preset.endpoint) return preset.endpoint;
  const template = preset.endpointTemplate;
  if (!template) return input.trim();
  return `${template.prefix}${input.trim()}${template.suffix}`;
}

/**
 * The image a wizard slot uses. Matching is by name — the platform's catalog
 * names are stable and survive an operator's edit, where a repository address
 * does not. An organization's own image of that name wins over the shared one:
 * registering `claude` yourself is a deliberate override.
 */
export function resolveImage(images: Image[], name: string, organizationId: string): Image | undefined {
  const matches = images.filter((image) => image.name.toLowerCase() === name.toLowerCase());
  return matches.find((image) => image.organizationId === organizationId) ?? matches[0];
}

/**
 * The tag a slot takes. Newest semver first, since it says which version is
 * running; then `latest`, which the version picker deliberately gives no
 * standing — but a repository publishing only build tags
 * (`tmp-<sha>-amd64`) has nothing else worth pinning, and picking one of those
 * by push time is how this wizard ended up pinning a throwaway build.
 */
export function newestTag(versions: ImageVersion[]): string {
  const { release, other } = groupVersions(versions);
  if (release[0]) return release[0].tag;
  return other.find((version) => version.tag === 'latest')?.tag ?? other[0]?.tag ?? '';
}

/**
 * The runner the wizard's environment lands on. The step asks no placement
 * question, so this picks rather than prompts: an organization's own runner is
 * its deliberate choice, and otherwise the shared one it can see. Ambiguity
 * among several of the same scope resolves by name, so a re-run picks the same one.
 */
export function resolveRunner(runners: Runner[], organizationId: string): Runner | undefined {
  const byName = [...runners].sort((left, right) => left.name.localeCompare(right.name));
  const owned = byName.filter((runner) => runner.organizationId === organizationId);
  return owned[0] ?? byName[0];
}

const NICKNAME_MAX = 32;

/**
 * The handle an agent is addressed by. Required before an agent can be
 * instantiated — adding a class to a thread mints an instance, and that fails
 * without one — so the wizard derives it rather than asking for it. Lowercase
 * `[a-z0-9_-]`, and unique within the organization.
 */
export function nicknameFrom(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .slice(0, NICKNAME_MAX) || 'agent';

  const used = new Set(taken.filter(Boolean).map((entry) => entry.toLowerCase()));
  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const tail = `-${suffix}`;
    const candidate = `${base.slice(0, NICKNAME_MAX - tail.length)}${tail}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, NICKNAME_MAX - 5)}-${Date.now().toString(36).slice(-4)}`;
}

/**
 * A name no resource in the organization holds yet. A re-run after an abandoned
 * one would otherwise collide on `default` and fail the step it opens with.
 */
export function availableName(taken: string[], preferred: string): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  if (!used.has(preferred.toLowerCase())) return preferred;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${preferred}-${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${preferred}-${Date.now()}`;
}
