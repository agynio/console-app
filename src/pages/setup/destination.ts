import { PRODUCTS, productUrl } from '@/lib/products';
import type { SetupState } from './useSetupWizard';

export type SetupDestination = {
  /** The product the switcher highlights and opens onto. */
  productId: string;
  /** Where that entry points for this run, instead of the product's home. */
  href: string;
  /** The line printed beside the arrow on the finish overlay. */
  label: string;
};

/**
 * Where a finished run sends the user. Null when no sibling host can be derived
 * — a bare hostname has no `chat.` beside it — in which case the overlay shows
 * no pointer rather than one that goes nowhere.
 */
export function setupDestination(
  state: SetupState,
  organizationId: string,
): SetupDestination | null {
  if (state.path === 'agent') {
    const base = productUrl(PRODUCTS.find((product) => product.id === 'chat')!);
    if (!base) return null;
    return {
      productId: 'chat',
      href: state.chatId ? `${base}/chats/${state.chatId}` : base,
      label: `Open Chat to talk to ${state.agentName || 'your agent'}`,
    };
  }

  const base = productUrl(PRODUCTS.find((product) => product.id === 'sandboxes')!);
  if (!base) return null;
  return {
    productId: 'sandboxes',
    href: state.sandboxId
      ? `${base}/organizations/${organizationId}/sandboxes/${state.sandboxId}`
      : base,
    label: 'Open Sandboxes to get a terminal',
  };
}
