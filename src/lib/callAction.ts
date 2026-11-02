// A tap on Answer or Decline in the call notification, held for 30 seconds until the call screen can use it.
type Act = 'accept' | 'decline';
let pending: { act: Act; callId: string | null; at: number } | null = null;
const subs = new Set<() => void>();

export function requestCallAction(act: Act, callId: string | null) {
  pending = { act, callId, at: Date.now() };
  subs.forEach((f) => f());
}

export function takeCallAction(callId: string | null): Act | null {
  const p = pending;
  if (!p) return null;
  if (Date.now() - p.at > 30000) {
    pending = null;
    return null;
  }
  if (p.callId && callId && p.callId !== callId) return null;
  pending = null;
  return p.act;
}

export function onCallAction(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
