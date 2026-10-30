-- Esquema de Supabase per al Tarrojapoly.
-- Només hi ha una partida alhora: la fila 1 de la taula «partida». L'estat sencer es guarda
-- com a JSON i cada mòbil el modifica amb el motor de src/engine/game.ts. La columna
-- «version» evita que dues accions simultànies es trepitgin.
--
-- Com que és un joc privat entre veïns i no hi ha comptes, la clau pública (anon) pot llegir
-- i escriure aquesta taula. No hi guardeu res que no sigui la partida.

create table if not exists public.partida (
  id integer primary key check (id = 1),
  state jsonb,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.partida (id, state, version) values (1, null, 0) on conflict (id) do nothing;

alter table public.partida enable row level security;

drop policy if exists "llegir la partida" on public.partida;
create policy "llegir la partida" on public.partida for select to anon, authenticated using (true);

drop policy if exists "desar la partida" on public.partida;
create policy "desar la partida" on public.partida for update to anon, authenticated using (true) with check (id = 1);

alter publication supabase_realtime add table public.partida;
