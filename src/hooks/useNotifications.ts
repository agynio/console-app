import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notificationsClient } from '@/api/client';

type UseNotificationsOptions = {
  events: string[];
  invalidateKeys: string[][];
  enabled?: boolean;
};

export function useNotifications(options: UseNotificationsOptions): void {
  const { events, invalidateKeys, enabled = true } = options;
  const queryClient = useQueryClient();
  const eventsRef = useRef(events);
  const keysRef = useRef(invalidateKeys);
  eventsRef.current = events;
  keysRef.current = invalidateKeys;

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();

    (async () => {
      try {
        for await (const response of notificationsClient.subscribe({}, { signal: controller.signal })) {
          const envelope = response.envelope;
          if (!envelope) continue;
          if (!eventsRef.current.includes(envelope.event)) continue;

          for (const key of keysRef.current) {
            void queryClient.invalidateQueries({ queryKey: key });
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('[useNotifications] stream error:', error);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [enabled, queryClient]);
}
