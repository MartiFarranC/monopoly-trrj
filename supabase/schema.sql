-- Esquema de Supabase per al Tarrojapoly.
--
-- Tot va dins l'esquema propi «tarrojapoly», separat de les taules de qualsevol altra web
-- del mateix projecte de Supabase. Aquest fitxer no toca res de fora d'aquest esquema
-- (només afegeix la taula al temps real).
--
-- Només hi ha una partida alhora: la fila 1 de la taula «partida». L'estat sencer es guarda
-- com a JSON i cada mòbil el modifica amb el motor de src/engine/game.ts. La columna
-- «version» evita que dues accions simultànies es trepitgin.
--
-- Com que és un joc privat entre veïns i no hi ha comptes, la clau pública (anon) pot llegir
-- i desar aquesta taula, i només aquesta.

create schema if not exists tarrojapoly;
grant usage on schema tarrojapoly to anon, authenticated;

create table if not exists tarrojapoly.partida (
  id integer primary key check (id = 1),
  state jsonb,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into tarrojapoly.partida (id, state, version) values (1, null, 0) on conflict (id) do nothing;

grant select, update on tarrojapoly.partida to anon, authenticated;

alter table tarrojapoly.partida enable row level security;

drop policy if exists "llegir la partida" on tarrojapoly.partida;
create policy "llegir la partida" on tarrojapoly.partida for select to anon, authenticated using (true);

drop policy if exists "desar la partida" on tarrojapoly.partida;
create policy "desar la partida" on tarrojapoly.partida for update to anon, authenticated using (true) with check (id = 1);

alter publication supabase_realtime add table tarrojapoly.partida;
