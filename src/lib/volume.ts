import { AttachmentKind, type Attachment } from '@/gen/agynio/api/runners/v1/runners_pb';
import { EMPTY_PLACEHOLDER } from '@/lib/format';

const UNATTACHED_LABEL = 'Unattached';

const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  [AttachmentKind.UNSPECIFIED]: 'Attachment',
  [AttachmentKind.AGENT]: 'Agent',
  [AttachmentKind.MCP]: 'MCP',
  [AttachmentKind.HOOK]: 'Hook',
};

export const formatVolumeAttachmentLabel = (attachment: Attachment) => {
  const name = attachment.name?.trim() || attachment.id || '';
  if (!name) return EMPTY_PLACEHOLDER;
  const kindLabel = ATTACHMENT_KIND_LABELS[attachment.kind] ?? 'Attachment';
  return kindLabel === 'Attachment' ? name : `${kindLabel} ${name}`;
};

const resolveAttachmentSortKey = (attachment: Attachment) => attachment.name?.trim() || attachment.id || '';

export const summarizeVolumeAttachments = (attachments: Attachment[]) => {
  if (attachments.length === 0) return UNATTACHED_LABEL;
  const labels = [...attachments]
    .sort((left, right) => resolveAttachmentSortKey(left).localeCompare(resolveAttachmentSortKey(right)))
    .map((attachment) => formatVolumeAttachmentLabel(attachment))
    .filter((label) => label !== EMPTY_PLACEHOLDER);
  if (labels.length === 0) return UNATTACHED_LABEL;
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1} more`;
};
