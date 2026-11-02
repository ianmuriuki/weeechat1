import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return reply({ error: 'not signed in' }, 401);

  let conversationId = '';
  try {
    conversationId = String((await req.json()).conversationId ?? '');
  } catch {
    return reply({ error: 'bad request' }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return reply({ error: 'bad conversation' }, 400);

  const { data: member } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', u.user.id)
    .maybeSingle();
  if (!member) return reply({ error: 'not a member' }, 403);

  const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', u.user.id).maybeSingle();

  const key = Deno.env.get('LIVEKIT_API_KEY');
  const secret = Deno.env.get('LIVEKIT_API_SECRET');
  const url = Deno.env.get('LIVEKIT_URL');
  if (!key || !secret || !url) return reply({ error: 'calls are not configured' }, 500);

  const at = new AccessToken(key, secret, { identity: u.user.id, name: (prof as { display_name?: string } | null)?.display_name ?? '' });
  at.addGrant({ roomJoin: true, room: conversationId, canPublish: true, canSubscribe: true });
  return reply({ token: await at.toJwt(), url });
});
