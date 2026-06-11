import { describe, expect, it } from 'vitest';
import {
  buildFormValuesFromRule,
  parseMethods,
  parsePorts,
  validateRuleForm,
} from '@/lib/egressRules';
import { EgressRuleAction, HeaderAuthScheme, type EgressRule } from '@/gen/agynio/api/egress/v1/egress_pb';

describe('egress rule form helpers', () => {
  it('parses comma separated ports and methods', () => {
    expect(parsePorts('443, 8443')).toEqual([443, 8443]);
    expect(parseMethods('get, post')).toEqual(['GET', 'POST']);
  });

  it('rejects invalid ports', () => {
    expect(() => parsePorts('0')).toThrow('Ports must be comma-separated integers');
    expect(() => parsePorts('65536')).toThrow('Ports must be comma-separated integers');
  });

  it('validates required fields and headers', () => {
    const validation = validateRuleForm({
      name: '',
      description: '',
      domainPattern: '',
      ports: '',
      methods: '',
      pathPattern: '',
      action: 'allow',
      headers: [{ name: 'Authorization', scheme: 'bearer', source: 'secretId', value: '' }],
    });

    expect(validation.errors.name).toBe('Name is required.');
    expect(validation.errors.domainPattern).toBe('Domain pattern is required.');
    expect(validation.errors.headers).toBe('Each header requires a name and value or secret ID.');
    expect(validation.parsed).toBeUndefined();
  });

  it('maps a rule into editable form values', () => {
    const rule: EgressRule = {
      $typeName: 'agynio.api.egress.v1.EgressRule',
      meta: {
        $typeName: 'agynio.api.egress.v1.EntityMeta',
        id: 'rule-id',
      },
      organizationId: 'org-id',
      name: 'api',
      description: 'description',
      matcher: {
        $typeName: 'agynio.api.egress.v1.EgressRuleMatcher',
        domainPattern: 'api.example.com',
        ports: [443],
        methods: ['GET'],
        pathPattern: '/v1/*',
      },
      effect: {
        $typeName: 'agynio.api.egress.v1.EgressRuleEffect',
        action: EgressRuleAction.ALLOW,
        inject: [
          {
            $typeName: 'agynio.api.egress.v1.EgressRuleHeader',
            name: 'Authorization',
            scheme: HeaderAuthScheme.BEARER,
            credential: { case: 'secretId', value: 'secret-id' },
          },
        ],
      },
    };

    expect(buildFormValuesFromRule(rule)).toMatchObject({
      name: 'api',
      domainPattern: 'api.example.com',
      ports: '443',
      methods: 'GET',
      action: 'allow',
      headers: [{ name: 'Authorization', scheme: 'bearer', source: 'secretId', value: 'secret-id' }],
    });
  });
});
