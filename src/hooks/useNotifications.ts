import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notificationsClient } from '@/api/client';
import type { NotificationEnvelope } from '@/gen/agynio/api/notifications/v1/notifications_pb';

type UseNotificationsOptions = {
  events: string[];
  rooms: string[];
  enabled?: boolean;
  invalidateKeys?: string[][];
  onEvent?: (envelope: NotificationEnvelope) => void;
};

export function useNotifications(options: UseNotificationsOptions): void {
  const { events, rooms, enabled = true, invalidateKeys = [], onEvent } = options;
  const queryClient = useQueryClient();
  const eventsRef = useRef(events);
  const keysRef = useRef(invalidateKeys);
  const onEventRef = useRef(onEvent);
  const roomsRef = useRef<string[]>([]);
  eventsRef.current = events;
  keysRef.current = invalidateKeys;
  onEventRef.current = onEvent;
  const normalizedRooms = useMemo(
    () => rooms.map((room) => room.trim()).filter((room) => room.length > 0),
    [rooms],
  );
  roomsRef.current = normalizedRooms;
  const roomsKey = normalizedRooms.join('|');

  useEffect(() => {
    if (!enabled || roomsRef.current.length === 0) return;

    const controller = new AbortController();

    (async () => {
      try {
        for await (const response of notificationsClient.subscribe(
          { rooms: roomsRef.current },
          { signal: controller.signal },
        )) {
          const envelope = response.envelope;
          if (!envelope) continue;
          if (!eventsRef.current.includes(envelope.event)) continue;

          onEventRef.current?.(envelope);
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
  }, [enabled, queryClient, roomsKey]);
}
