// On es guarda la partida. Amb Supabase, tots els mòbils comparteixen la mateixa partida en
// temps real. Sense Supabase configurat, es guarda al navegador (mode prova en un sol dispositiu).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import type { GameState } from '../engine/game';

export interface Snapshot {
  state: GameState | null;
  version: number;
}

export interface GameStore {
  readonly online: boolean;
  load(): Promise<Snapshot>;
  subscribe(cb: (snap: Snapshot) => void): () => void;
  /**
   * Aplica `fn` sobre l'estat més recent i el desa. Si un altre mòbil ha desat entremig,
   * ho torna a provar amb l'estat nou. Els errors de `fn` (regles) arriben a qui crida.
   */
  update(fn: (current: GameState | null) => GameState): Promise<Snapshot>;
}

export function createStore(): GameStore {
  return SUPABASE_URL && SUPABASE_ANON_KEY ? new SupabaseStore(createClient(SUPABASE_URL, SUPABASE_ANON_KEY)) : new LocalStore();
}

const TABLE = 'partida';
const ROW = 1;

class SupabaseStore implements GameStore {
  readonly online = true;
  constructor(private db: SupabaseClient) {}

  async load(): Promise<Snapshot> {
    const { data, error } = await this.db.from(TABLE).select('state, version').eq('id', ROW).single();
    if (error) throw new Error(`No es pot llegir la partida: ${error.message}`);
    return { state: data.state as GameState | null, version: data.version as number };
  }

  subscribe(cb: (snap: Snapshot) => void): () => void {
    const channel = this.db
      .channel('partida')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: TABLE }, (payload) => {
        const row = payload.new as { state: GameState | null; version: number };
        cb({ state: row.state, version: row.version });
      })
      .subscribe();
    return () => void this.db.removeChannel(channel);
  }

  async update(fn: (current: GameState | null) => GameState): Promise<Snapshot> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const current = await this.load();
      const next = fn(current.state);
      const { data, error } = await this.db
        .from(TABLE)
        .update({ state: next, version: current.version + 1, updated_at: new Date().toISOString() })
        .eq('id', ROW)
        .eq('version', current.version)
        .select('version');
      if (error) throw new Error(`No es pot desar la partida: ${error.message}`);
      if (data.length) return { state: next, version: current.version + 1 };
    }
    throw new Error('Hi ha massa moviment ara mateix. Torna-ho a provar.');
  }
}

const KEY = 'tarrojapoly:partida';

class LocalStore implements GameStore {
  readonly online = false;
  private listeners = new Set<(snap: Snapshot) => void>();

  constructor() {
    // Altres pestanyes del mateix navegador també ho veuen.
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) this.emit(this.read());
    });
  }

  private read(): Snapshot {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Snapshot) : { state: null, version: 0 };
    } catch {
      return { state: null, version: 0 };
    }
  }

  private emit(snap: Snapshot) {
    this.listeners.forEach((cb) => cb(snap));
  }

  async load(): Promise<Snapshot> {
    return this.read();
  }

  subscribe(cb: (snap: Snapshot) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async update(fn: (current: GameState | null) => GameState): Promise<Snapshot> {
    const current = this.read();
    const snap = { state: fn(current.state), version: current.version + 1 };
    try {
      localStorage.setItem(KEY, JSON.stringify(snap));
    } catch {
      // Sense espai o en mode privat: la partida continua a la memòria d'aquesta pestanya.
    }
    this.emit(snap);
    return snap;
  }
}
