import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notificationsClient } from '@/api/client';

type UseNotificationsOptions = {
  events: string[];
  invalidateKeys: string[][];
  rooms: string[];
  enabled?: boolean;
};

export function useNotifications(options: UseNotificationsOptions): void {
  const { events, invalidateKeys, rooms, enabled = true } = options;
  const queryClient = useQueryClient();
  const eventsRef = useRef(events);
  const keysRef = useRef(invalidateKeys);
  const roomsRef = useRef(rooms);
  const roomsKey = rooms.join('|');
  const hasRooms = rooms.length > 0;
  eventsRef.current = events;
  keysRef.current = invalidateKeys;
  roomsRef.current = rooms;

  useEffect(() => {
    if (!enabled) return;
    if (!hasRooms) {
      console.error('[useNotifications] rooms are required to subscribe');
      return;
    }

    const controller = new AbortController();
    const requestRooms = roomsRef.current;

    (async () => {
      try {
        for await (const response of notificationsClient.subscribe({ rooms: requestRooms }, { signal: controller.signal })) {
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
  }, [enabled, hasRooms, queryClient, roomsKey]);
}
