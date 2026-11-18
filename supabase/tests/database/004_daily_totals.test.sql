-- Issue #19: daily_totals (Chart.md §4–5). AC: CHART-02, CHART-03, CHART-12. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-d000-00000000000a', 'authenticated', 'authenticated', 'chart-a@test.local'),
  ('00000000-0000-4000-d000-00000000000b', 'authenticated', 'authenticated', 'chart-b@test.local');

-- A: two meals yesterday, one meal 3 days ago, one meal 40 days ago (outside any range).
insert into public.meal_entries (user_id, eaten_on, name, calories_kcal, protein_g, sodium_mg, sugar_g) values
  ('00000000-0000-4000-d000-00000000000a', current_date - 1, 'Bún nạm', 450, 25, 1800, 6),
  ('00000000-0000-4000-d000-00000000000a', current_date - 1, 'Chè', 250, 3.5, 20, 30.5),
  ('00000000-0000-4000-d000-00000000000a', current_date - 3, 'Phở', 400, 20, 1500, 3),
  ('00000000-0000-4000-d000-00000000000a', current_date - 40, 'Cơm', 600, 15, 900, 2),
  ('00000000-0000-4000-d000-00000000000b', current_date - 1, 'Bánh mì', 350, 12, 700, 4);

-- ------------------------------------------------------------ act as A
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-d000-00000000000a","role":"authenticated"}';

select results_eq(
  $$ select eaten_on, calories_kcal, protein_g, sodium_mg, sugar_g
       from public.daily_totals(current_date - 6, current_date) $$,
  $$ values (current_date - 3, 400, 20.0::numeric, 1500, 3.0::numeric),
            (current_date - 1, 700, 28.5::numeric, 1820, 36.5::numeric) $$,
  'CHART-02/03: one row per day with meals, summed; empty days have no row'
);
select is(
  (select count(*)::int from public.daily_totals(current_date - 29, current_date)),
  2,
  'a 30-day range leaves out meals older than its first day'
);
select lives_ok(
  $$ select * from public.daily_totals(current_date - 30, current_date) $$,
  'a 31-day range is accepted'
);
select throws_ok(
  $$ select * from public.daily_totals(current_date - 31, current_date) $$,
  '22023', null, 'a range longer than 31 days is refused'
);
select throws_ok(
  $$ select * from public.daily_totals(current_date, current_date - 1) $$,
  '22023', null, 'a reversed range is refused'
);
select throws_ok(
  $$ select * from public.daily_totals(null, current_date) $$,
  '22023', null, 'a missing bound is refused'
);

-- ------------------------------------------------------------ act as B
set local request.jwt.claims to '{"sub":"00000000-0000-4000-d000-00000000000b","role":"authenticated"}';
select results_eq(
  $$ select eaten_on, calories_kcal from public.daily_totals(current_date - 6, current_date) $$,
  $$ values (current_date - 1, 350) $$,
  'CHART-12: B only gets B''s totals'
);

-- ------------------------------------------------------------ anon
reset role;
set local role anon;
select throws_ok(
  $$ select * from public.daily_totals(current_date - 6, current_date) $$,
  '42501', null, 'anon cannot call daily_totals'
);
reset role;
select ok(
  not has_function_privilege('public', 'public.daily_totals(date, date)', 'execute'),
  'PUBLIC has no execute grant'
);

select * from finish();
rollback;
