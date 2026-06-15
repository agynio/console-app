import { create } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';
import { AttachmentKind, AttachmentSchema } from '@/gen/agynio/api/runners/v1/runners_pb';
import { formatVolumeAttachmentLabel, summarizeVolumeAttachments } from '@/lib/volume';

describe('volume attachment labels', () => {
  it('formats attachments by kind and name', () => {
    expect(
      formatVolumeAttachmentLabel(
        create(AttachmentSchema, {
          kind: AttachmentKind.AGENT,
          id: 'agent-1',
          name: 'Research agent',
        }),
      ),
    ).toBe('Agent Research agent');
  });

  it('summarizes multiple attachments with a remaining count', () => {
    const summary = summarizeVolumeAttachments([
      create(AttachmentSchema, { kind: AttachmentKind.HOOK, id: 'hook-1', name: 'Hook B' }),
      create(AttachmentSchema, { kind: AttachmentKind.MCP, id: 'mcp-1', name: 'MCP A' }),
      create(AttachmentSchema, { kind: AttachmentKind.AGENT, id: 'agent-1', name: 'Agent C' }),
    ]);

    expect(summary).toBe('Agent Agent C +2 more');
  });

  it('uses unattached for empty attachments', () => {
    expect(summarizeVolumeAttachments([])).toBe('Unattached');
  });
});
