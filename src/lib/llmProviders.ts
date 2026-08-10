import { AuthMethod, Protocol } from '@/gen/agynio/api/llm/v1/llm_pb';

export function formatLlmProtocol(protocol?: Protocol): string {
  if (protocol === Protocol.RESPONSES) return 'Responses';
  if (protocol === Protocol.ANTHROPIC_MESSAGES) return 'Anthropic Messages';
  return 'Unspecified';
}

export type LlmProviderPresetKey = 'openai' | 'anthropic' | 'custom';

export type LlmProviderPreset = {
  key: LlmProviderPresetKey;
  label: string;
  /** What the vendor's endpoint speaks, shown in place of the fields it fixes. */
  hint: string;
  /** Shape of the credential, so the field says what to paste into it. */
  tokenPlaceholder: string;
  endpoint: string;
  authMethod: AuthMethod;
  protocol: Protocol;
};

/**
 * The endpoint is the URL the proxy POSTs to, not an origin it appends a path
 * to, so these carry the full path each vendor answers on. Auth method and
 * protocol are the vendor's, not a preference: Anthropic reads x-api-key and
 * speaks Messages, OpenAI reads a bearer token and speaks Responses.
 */
export const LLM_PROVIDER_PRESETS: LlmProviderPreset[] = [
  {
    key: 'openai',
    label: 'OpenAI',
    hint: 'Responses API',
    tokenPlaceholder: 'sk-...',
    endpoint: 'https://api.openai.com/v1/responses',
    authMethod: AuthMethod.BEARER,
    protocol: Protocol.RESPONSES,
  },
  {
    key: 'anthropic',
    label: 'Anthropic',
    hint: 'Messages API',
    tokenPlaceholder: 'sk-ant-...',
    endpoint: 'https://api.anthropic.com/v1/messages',
    authMethod: AuthMethod.X_API_KEY,
    protocol: Protocol.ANTHROPIC_MESSAGES,
  },
];

