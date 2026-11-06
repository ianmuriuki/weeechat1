-- New Android notification channels with an explicit sound, so every phone plays its own default notification sound and vibration.
-- Android never changes a channel after it is created, so the server now targets messages_v2 and alerts_v2.
-- This rewrites every public function that names the old channels. Safe to run twice.
begin;

do $$
declare
  r record;
  def text;
  fixed text;
  n int := 0;
begin
  for r in
    select p.oid
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%channelId%'
  loop
    def := pg_get_functiondef(r.oid);
    fixed := regexp_replace(def, '''channelId''\s*,\s*''messages''', '''channelId'', ''messages_v2''', 'g');
    fixed := regexp_replace(fixed, '''channelId''\s*,\s*''alerts''', '''channelId'', ''alerts_v2''', 'g');
    if fixed <> def then
      execute fixed;
      n := n + 1;
    end if;
  end loop;
  raise notice 'rewrote % push functions', n;
end
$$;

commit;
