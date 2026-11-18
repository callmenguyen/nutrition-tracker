-- Issue #19: per-day totals for the Biểu đồ tab (Chart.md §4–5; ADR-004, ADR-005).
-- One row per day that has meals in [p_from, p_to]; days without meals have no row (drawn as gaps).
-- security invoker: the RLS policies of meal_entries keep it to the caller's own rows (CHART-12).
create or replace function public.daily_totals(p_from date, p_to date)
returns table (
  eaten_on date,
  calories_kcal integer,
  protein_g numeric,
  sodium_mg integer,
  sugar_g numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    raise exception 'daily_totals: range must be 1 to 31 days' using errcode = '22023';
  end if;
  return query
    select m.eaten_on,
           sum(m.calories_kcal)::integer,
           sum(m.protein_g),
           sum(m.sodium_mg)::integer,
           sum(m.sugar_g)
      from public.meal_entries m
     where m.eaten_on between p_from and p_to
     group by m.eaten_on
     order by m.eaten_on;
end;
$$;

revoke all on function public.daily_totals(date, date) from public, anon;
grant execute on function public.daily_totals(date, date) to authenticated;
