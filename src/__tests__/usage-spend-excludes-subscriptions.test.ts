import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// Token queries are declared in two places -- the LLM section's fixed set and
// the consumer rankings built per level -- so both are scanned: a filter
// dropped in either one bills subscription tokens that cost nothing.
const source = [
  readFileSync(join(here, '../pages/usage/LlmSection.tsx'), 'utf8'),
  readFileSync(join(here, '../lib/usageConsumers.ts'), 'utf8'),
].join('\n');

// A subscription is a flat fee: its tokens have no marginal cost, and summing
// them alongside API tokens produces a bill that does not exist. The only thing
// keeping the two apart is the resource label, so every token query has to name
// which side it reads -- an unfiltered one silently mixes them back together.
describe('usage spend views', () => {
  it('names a resource on every token query', () => {
    const tokenQueries = source
      .split(/\n\s*\{/)
      .filter((block) => block.includes('unit: Unit.TOKENS'));

    expect(tokenQueries.length).toBeGreaterThan(0);
    for (const block of tokenQueries) {
      expect(block).toMatch(/METERED_MODEL_TOKENS|SUBSCRIPTION_TOKENS/);
    }
  });

  // The rankings and the headline figures are the spend views proper. Only the
  // queries that opt into the subscription side may leave resource=model.
  it('keeps subscription tokens out of the consumer rankings', () => {
    const consumerQueries = source
      .split(/\n\s*\{/)
      .filter((block) => block.includes('unit: Unit.TOKENS') && block.includes('llm-consumers-'));

    expect(consumerQueries.length).toBeGreaterThan(0);
    for (const block of consumerQueries) {
      expect(block).toContain('METERED_MODEL_TOKENS');
    }
  });

  it('leaves the request count unfiltered, since a native call is still a call', () => {
    const requestQuery = source
      .split(/\n\s*\{/)
      .find((block) => block.includes("key: 'llm-requests-total'"));

    expect(requestQuery).toBeDefined();
    expect(requestQuery).not.toContain('METERED_MODEL_TOKENS');
  });
});
