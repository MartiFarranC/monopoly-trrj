-- Esquema de Supabase per al Monopoly de Tarroja.
-- L'estat de la partida es guarda sencer a games.state (JSON) i només el modifica la
-- funció del servidor que aplica les accions amb el motor de src/engine/game.ts.
-- Els mòbils l'escolten amb Supabase Realtime.

-- Usuaris del poble. La llista la carrega el Martí; cada usuari entra amb el seu correu.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  master uuid not null references public.profiles (id),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  state jsonb not null,
  -- S'incrementa a cada acció; evita que dues accions simultànies es trepitgin.
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Només hi pot haver una partida en curs alhora (no fem servir codis).
create unique index one_active_game on public.games ((status <> 'finished')) where status <> 'finished';

-- Historial de totes les accions, per poder revisar o refer una partida.
create table public.game_actions (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  actor uuid not null references public.profiles (id),
  action jsonb not null,
  version integer not null,
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  author uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_actions enable row level security;
alter table public.chat_messages enable row level security;

-- Tots els usuaris del poble es poden veure entre ells; cadascú edita només el seu perfil.
create policy "profiles visibles" on public.profiles for select to authenticated using (true);
create policy "editar el meu perfil" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Qualsevol usuari pot veure la partida (és un joc entre veïns). Les escriptures a games
-- i game_actions només les fa la funció del servidor amb la service role key.
create policy "partides visibles" on public.games for select to authenticated using (true);
create policy "accions visibles" on public.game_actions for select to authenticated using (true);

create policy "xat visible" on public.chat_messages for select to authenticated using (true);
create policy "escriure al xat" on public.chat_messages for insert to authenticated
  with check (
    author = auth.uid()
    and exists (
      select 1 from public.games g
      where g.id = game_id and g.state -> 'invited' ? auth.uid()::text
    )
  );

alter publication supabase_realtime add table public.games, public.chat_messages;
