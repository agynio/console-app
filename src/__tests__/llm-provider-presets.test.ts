import { describe, expect, it } from 'vitest';
import { AuthMethod, Protocol } from '@/gen/agynio/api/llm/v1/llm_pb';
import { formatAuthMethod } from '@/lib/format';
import { LLM_PROVIDER_PRESETS, formatLlmProtocol } from '@/lib/llmProviders';

const openai = LLM_PROVIDER_PRESETS.find((preset) => preset.key === 'openai')!;
const anthropic = LLM_PROVIDER_PRESETS.find((preset) => preset.key === 'anthropic')!;

describe('llm provider presets', () => {
  // The endpoint is the URL the proxy POSTs to, not an origin it appends a path
  // to, so a preset missing the path sends every call to the wrong place.
  it('carries the full endpoint each vendor answers on', () => {
    expect(openai.endpoint).toBe('https://api.openai.com/v1/responses');
    expect(anthropic.endpoint).toBe('https://api.anthropic.com/v1/messages');
  });

  // Auth method and protocol are the vendor's, not a preference. Anthropic
  // reads x-api-key and speaks Messages; a bearer token there is a 401.
  // The picker shows these under each name in place of the fields they fix, so
  // a preset without them leaves the tile blank.
  it('says what each vendor speaks and what its credential looks like', () => {
    expect(openai.hint).toBeTruthy();
    expect(openai.tokenPlaceholder).toBeTruthy();
    expect(anthropic.hint).toBeTruthy();
    expect(anthropic.tokenPlaceholder).toBeTruthy();
  });

  // OpenAI is the tile selected when the dialog opens, so it has to be first.
  it('leads with the default vendor', () => {
    expect(LLM_PROVIDER_PRESETS[0].key).toBe('openai');
  });

  it('pairs each vendor with the auth method and protocol it actually uses', () => {
    expect(openai.authMethod).toBe(AuthMethod.BEARER);
    expect(openai.protocol).toBe(Protocol.RESPONSES);
    expect(anthropic.authMethod).toBe(AuthMethod.X_API_KEY);
    expect(anthropic.protocol).toBe(Protocol.ANTHROPIC_MESSAGES);
  });

});

describe('llm provider labels', () => {
  it('names both protocols', () => {
    expect(formatLlmProtocol(Protocol.RESPONSES)).toBe('Responses');
    expect(formatLlmProtocol(Protocol.ANTHROPIC_MESSAGES)).toBe('Anthropic Messages');
    expect(formatLlmProtocol(Protocol.UNSPECIFIED)).toBe('Unspecified');
  });

  // Every Anthropic provider listed as "Unspecified" until this was mapped.
  it('names x-api-key rather than calling it unspecified', () => {
    expect(formatAuthMethod(AuthMethod.X_API_KEY)).toBe('x-api-key');
    expect(formatAuthMethod(AuthMethod.BEARER)).toBe('Bearer');
    expect(formatAuthMethod(AuthMethod.UNSPECIFIED)).toBe('Unspecified');
  });
});
