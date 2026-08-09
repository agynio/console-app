import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '../pages/OrganizationUsageTab.tsx'), 'utf8');

// A subscription is a flat fee: its tokens have no marginal cost, and summing
// them alongside API tokens produces a bill that does not exist. The only thing
// keeping the two apart is the resource label, so every token query that feeds
// a spend view has to carry the filter.
describe('usage spend views', () => {
  it('filters token queries to resource=model', () => {
    const tokenQueries = source
      .split(/\n\s*\{/)
      .filter((block) => block.includes('unit: Unit.TOKENS'));

    expect(tokenQueries.length).toBeGreaterThan(0);
    for (const block of tokenQueries) {
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
