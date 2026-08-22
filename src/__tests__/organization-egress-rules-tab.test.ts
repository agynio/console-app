import { describe, expect, it } from 'vitest';
import {
  buildFormValuesFromRule,
  DEFAULT_EGRESS_RULE_FORM_VALUES,
  normalizeRuleFormValues,
  parseMethods,
  parsePorts,
  upstreamTlsToProto,
  validateRuleForm,
} from '@/lib/egressRules';
import { EgressRuleAction, HeaderAuthScheme, type EgressRule } from '@/gen/agynio/api/egress/v1/egress_pb';

describe('egress rule form helpers', () => {
  it('parses comma separated ports and methods', () => {
    expect(parsePorts('8443, 443, 443')).toEqual([443, 8443]);
    expect(parseMethods('post, get, post')).toEqual(['GET', 'POST']);
  });

  it('rejects invalid ports', () => {
    expect(() => parsePorts('0')).toThrow('Ports must be comma-separated integers');
    expect(() => parsePorts('65536')).toThrow('Ports must be comma-separated integers');
  });

  it('validates required fields and headers', () => {
    const validation = validateRuleForm({
      ...DEFAULT_EGRESS_RULE_FORM_VALUES,
      headers: [{ name: 'Authorization', scheme: 'bearer', source: 'secretId', value: '' }],
    });

    expect(validation.errors.name).toBe('Name is required.');
    expect(validation.errors.domainPattern).toBe('Domain pattern is required.');
    expect(validation.errors.headers).toBe('Each header requires a name and literal value or selected secret.');
    expect(validation.parsed).toBeUndefined();
  });

  it('requires a username on basic headers', () => {
    const validation = validateRuleForm({
      ...DEFAULT_EGRESS_RULE_FORM_VALUES,
      name: 'github',
      domainPattern: 'github.com',
      headers: [{ name: 'Authorization', scheme: 'basic', source: 'secretId', username: '', value: 'secret-id' }],
    });

    expect(validation.errors.headers).toBe('Basic headers require a username.');
    expect(validation.parsed).toBeUndefined();
  });

  it('drops the username when the scheme is not basic', () => {
    const validation = validateRuleForm(normalizeRuleFormValues({
      ...DEFAULT_EGRESS_RULE_FORM_VALUES,
      name: 'github',
      domainPattern: 'github.com',
      headers: [{ name: 'Authorization', scheme: 'bearer', source: 'secretId', username: 'x-access-token', value: 'secret-id' }],
    }));

    expect(validation.errors.headers).toBeUndefined();
    expect(validation.parsed?.headers[0].username).toBe('');
  });

  it('requires literal header re-entry when values are not echoed', () => {
    const rule: EgressRule = {
      $typeName: 'agynio.api.egress.v1.EgressRule',
      meta: { $typeName: 'agynio.api.egress.v1.EntityMeta', id: 'rule-id' },
      organizationId: 'org-id',
      name: 'api',
      description: '',
      matcher: { $typeName: 'agynio.api.egress.v1.EgressRuleMatcher', domainPattern: 'api.example.com', ports: [], methods: [], pathPattern: '' },
      effect: {
        $typeName: 'agynio.api.egress.v1.EgressRuleEffect',
        action: EgressRuleAction.ALLOW,
        inject: [{ $typeName: 'agynio.api.egress.v1.EgressRuleHeader', name: 'X-Token', scheme: HeaderAuthScheme.UNSPECIFIED, credential: { case: undefined } }],
      },
    };

    const formValues = buildFormValuesFromRule(rule);
    expect(formValues.headers[0]).toMatchObject({ source: 'value', value: '', requiresValueReentry: true });
    const validation = validateRuleForm(formValues);
    expect(validation.errors.headers).toBe('Literal header values are not displayed; enter a new value or remove the header.');
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

describe('private destination form helpers', () => {
  it('requires a resource for a private destination and no domain', () => {
    const validation = validateRuleForm({
      ...DEFAULT_EGRESS_RULE_FORM_VALUES,
      name: 'gitlab-token',
      destinationKind: 'private',
    });
    expect(validation.errors.privateResourceId).toBe('Select a private resource.');
    expect(validation.errors.domainPattern).toBeUndefined();
    expect(validation.parsed).toBeUndefined();
  });

  it('requires the secret when trust is a CA bundle', () => {
    const validation = validateRuleForm({
      ...DEFAULT_EGRESS_RULE_FORM_VALUES,
      name: 'gitlab-token',
      destinationKind: 'private',
      privateResourceId: 'resource-1',
      upstreamTrust: 'caBundle',
    });
    expect(validation.errors.upstreamCaSecretId).toBe('Select the CA bundle secret.');
  });

  it('accepts a private destination without ports', () => {
    const validation = validateRuleForm({
      ...DEFAULT_EGRESS_RULE_FORM_VALUES,
      name: 'gitlab-token',
      destinationKind: 'private',
      privateResourceId: 'resource-1',
    });
    expect(validation.parsed?.privateResourceId).toBe('resource-1');
    expect(validation.parsed?.ports).toEqual([]);
  });

  it('builds form values from a private rule', () => {
    const rule: EgressRule = {
      $typeName: 'agynio.api.egress.v1.EgressRule',
      meta: { $typeName: 'agynio.api.egress.v1.EntityMeta', id: 'rule-id' },
      organizationId: 'org-id',
      name: 'gitlab',
      description: '',
      matcher: {
        $typeName: 'agynio.api.egress.v1.EgressRuleMatcher',
        domainPattern: '',
        privateResourceId: 'resource-1',
        ports: [],
        methods: [],
        pathPattern: '',
      },
      effect: { $typeName: 'agynio.api.egress.v1.EgressRuleEffect', action: EgressRuleAction.ALLOW, inject: [] },
      upstreamTls: {
        $typeName: 'agynio.api.egress.v1.EgressRuleUpstreamTls',
        serverName: 'gitlab.internal',
        trust: { case: 'caBundleSecretId', value: 'secret-1' },
      },
    };
    const values = buildFormValuesFromRule(rule);
    expect(values.destinationKind).toBe('private');
    expect(values.privateResourceId).toBe('resource-1');
    expect(values.upstreamServerName).toBe('gitlab.internal');
    expect(values.upstreamTrust).toBe('caBundle');
    expect(values.upstreamCaSecretId).toBe('secret-1');
  });

  it('shapes upstream tls for the request', () => {
    const base = validateRuleForm({
      ...DEFAULT_EGRESS_RULE_FORM_VALUES,
      name: 'gitlab-token',
      destinationKind: 'private',
      privateResourceId: 'resource-1',
      upstreamTrust: 'skipVerify',
    });
    expect(upstreamTlsToProto(base.parsed!)).toEqual({ serverName: '', trust: { case: 'insecureSkipVerify', value: true } });
    const publicRule = validateRuleForm({ ...DEFAULT_EGRESS_RULE_FORM_VALUES, name: 'api', domainPattern: 'api.example.com' });
    expect(upstreamTlsToProto(publicRule.parsed!)).toBeUndefined();
  });
});
