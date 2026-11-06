-- Plans no longer get a made up category. "other" is the default and shows no label.
begin;

alter table public.me_plans drop constraint if exists me_plans_cat_check;
alter table public.me_plans add constraint me_plans_cat_check check (cat in ('other', 'date', 'errand', 'workout', 'study', 'trip'));
alter table public.me_plans alter column cat set default 'other';

alter table public.weee_plans drop constraint if exists weee_plans_cat_check;
alter table public.weee_plans add constraint weee_plans_cat_check check (cat in ('other', 'date', 'errand', 'workout', 'study', 'trip'));
alter table public.weee_plans alter column cat set default 'other';

commit;
