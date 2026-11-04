import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';
import { useSession } from '../lib/session';
import { canPush, clearNotifications, loadNotifications, registerForPush } from '../lib/push';
import { requestCallAction } from '../lib/callAction';

// Registers this phone for push after sign in and opens the chat when a notification is tapped.
export function PushBridge() {
  const { session, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ conversationId?: string }>();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const handled = useRef<string | null>(null);
  const uid = session?.user.id;

  useEffect(() => {
    if (!canPush() || loading || !uid) return;
    registerForPush();
  }, [loading, uid]);

  useEffect(() => {
    if (!canPush() || loading || !uid) return;
    clearNotifications();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') clearNotifications();
    });
    return () => sub.remove();
  }, [loading, uid]);

  useEffect(() => {
    if (!canPush() || loading || !uid) return;
    let alive = true;
    let sub: { remove: () => void } | null = null;
    (async () => {
      const N = await loadNotifications();
      if (!alive) return;
      const open = (resp: NotificationResponse) => {
        const act = resp.actionIdentifier;
        if (act !== N.DEFAULT_ACTION_IDENTIFIER && act !== 'accept' && act !== 'decline') return;
        const id = resp.notification.request.identifier;
        if (handled.current === id) return;
        handled.current = id;
        const data = resp.notification.request.content.data as { type?: string; callId?: string; conversationId?: string } | undefined;
        if (data?.type === 'call') {
          if (act === 'accept' || act === 'decline') {
            requestCallAction(act, data.callId ?? null);
            return;
          }
          if (pathRef.current !== '/calls') router.push('/calls' as never);
          return;
        }
        if (data?.type === 'weee' || data?.type === 'workout-running' || data?.type === 'workout-done') {
          if (pathRef.current !== '/weee') router.push('/weee' as never);
          return;
        }
        if (data?.type !== 'message' || !data.conversationId) return;
        if (pathRef.current !== '/chat/room' || params.conversationId !== data.conversationId) {
          router.push(('/chat/room?conversationId=' + data.conversationId) as never);
        }
      };
      const last = typeof N.getLastNotificationResponse === 'function' ? N.getLastNotificationResponse() : null;
      if (last) {
        open(last);
        N.clearLastNotificationResponse();
      }
      sub = N.addNotificationResponseReceivedListener(open);
    })().catch((e) => console.warn('push listener setup failed', e));
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [loading, uid, params.conversationId, router]);

  return null;
}
