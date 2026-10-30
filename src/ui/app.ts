// Controlador de l'app: qui sóc, quina partida hi ha i quina pantalla toca.

import { MAX_PLAYERS, MIN_PLAYERS } from '../data/board';
import { USERS, userById } from '../data/users';
import { applyAction, createGame, type Action, type GameState } from '../engine/game';
import { RuleError } from '../engine/rules';
import { createStore, type GameStore, type Snapshot } from '../net/store';
import { TableScreen } from './table';
import { avatar, esc } from './visual';

const ME_KEY = 'tarrojapoly:jo';

export interface Screen {
  update(state: GameState): void;
  destroy(): void;
}

export class App {
  readonly store: GameStore = createStore();
  me: string | null = readMe();
  snap: Snapshot = { state: null, version: 0 };
  private screen: Screen | null = null;
  private screenKind = '';
  /** Selecció de jugadors i ordre de torn mentre es prepara la partida (només en aquest mòbil). */
  private picking: string[] = [];
  private order: string[] = [];
  private creating = false;

  constructor(private root: HTMLElement) {}

  async start() {
    this.root.innerHTML = '<div class="screen"><div class="logo">TARROJAPOLY</div><p class="mode">Carregant…</p></div>';
    try {
      this.snap = await this.store.load();
    } catch (e) {
      this.root.innerHTML = `<div class="screen"><div class="logo">TARROJAPOLY</div><div class="cardbox"><p>${esc((e as Error).message)}</p>
        <button class="pill red" onclick="location.reload()">Tornar-ho a provar</button></div></div>`;
      return;
    }
    this.store.subscribe((snap) => {
      if (snap.version >= this.snap.version) {
        this.snap = snap;
        this.render();
      }
    });
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.render();
  }

  /** Fa una acció de joc com a l'usuari actual. Els errors de regles es mostren com a avís. */
  async act(action: Action): Promise<boolean> {
    const me = this.me;
    if (!me) return false;
    try {
      const snap = await this.store.update((cur) => {
        if (!cur) throw new RuleError('No hi ha cap partida');
        return applyAction(cur, me, action);
      });
      this.accept(snap);
      return true;
    } catch (e) {
      this.flash((e as Error).message);
      return false;
    }
  }

  private accept(snap: Snapshot) {
    if (snap.version >= this.snap.version) {
      this.snap = snap;
      this.render();
    }
  }

  flash(text: string) {
    if (this.screen instanceof TableScreen) return this.screen.toast('info', text, '', 3200);
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.bottom = '24px';
    el.innerHTML = `<div><b>${esc(text)}</b></div>`;
    this.root.querySelector('.app')?.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  private setMe(id: string | null) {
    this.me = id;
    try {
      if (id) localStorage.setItem(ME_KEY, id);
      else localStorage.removeItem(ME_KEY);
    } catch {
      // Sense localStorage, cal triar l'usuari cada vegada.
    }
    this.render();
  }

  switchUser() {
    this.setMe(null);
  }

  render() {
    const st = this.snap.state;
    const active = st && st.status !== 'finished' ? st : null;
    let kind: string;
    if (!this.me) kind = 'login';
    else if (!active) kind = this.creating ? 'create' : 'home';
    else if (active.status === 'lobby') kind = 'lobby';
    else if (active.turnOrder.includes(this.me)) kind = 'table';
    else kind = 'busy';

    if (kind === 'table') {
      if (this.screenKind !== 'table' || !(this.screen instanceof TableScreen) || (this.screen as TableScreen).gameId !== active!.id) {
        this.screen?.destroy();
        this.root.innerHTML = '';
        this.screen = new TableScreen(this, this.root, active!);
      } else {
        this.screen.update(active!);
      }
      this.screenKind = kind;
      return;
    }
    this.screen?.destroy();
    this.screen = null;
    this.screenKind = kind;
    const shell = (inner: string) => `<div class="shell"><main class="app"><div class="screen">${inner}</div></main></div>`;
    const scroll = this.root.querySelector('.screen')?.scrollTop ?? 0;
    this.root.innerHTML = shell(this.page(kind, active));
    const sc = this.root.querySelector('.screen');
    if (sc) sc.scrollTop = scroll;
  }

  private page(kind: string, st: GameState | null): string {
    const me = this.me!;
    const logo = '<div class="logo">TARROJAPOLY</div>';
    const who = me ? `<button class="link" data-a="switch">Ets ${esc(userById(me).name)}. Canviar d'usuari</button>` : '';
    const mode = this.store.online ? '' : '<p class="mode">Mode prova: la partida només es guarda en aquest mòbil fins que connectem Supabase.</p>';
    switch (kind) {
      case 'login':
        return `${logo}<h2>Qui ets?</h2><p class="lead">Tria el teu nom. Aquest mòbil se'n recordarà.</p>
          <div class="users">${USERS.map((u) => `<button class="user" data-a="pickMe" data-v="${u.id}">${avatar(u.id)}${esc(u.name)}</button>`).join('')}</div>${mode}`;
      case 'home':
        return `${logo}<div class="cardbox"><p><b>No hi ha cap partida en marxa.</b></p><p>Si la crees, seràs el màster: acceptaràs les compres i les cases dels altres i també jugaràs.</p>
          <button class="pill red wide" data-a="create">Crear partida</button></div>${who}${mode}`;
      case 'create': {
        const n = this.picking.length;
        return `<h2>Qui juga?</h2><p class="lead">Tria entre ${MIN_PLAYERS} i ${MAX_PLAYERS} jugadors, tu inclòs. Portes ${n}.</p>
          <div class="users">${USERS.map((u) => {
            const on = this.picking.includes(u.id);
            const off = !on && n >= MAX_PLAYERS;
            return `<button class="user ${on ? 'on' : ''} ${off ? 'off' : ''}" data-a="togglePlayer" data-v="${u.id}" ${u.id === me ? 'disabled' : ''}>${avatar(u.id)}${esc(u.name)}${u.id === me ? '<small>tu, màster</small>' : ''}</button>`;
          }).join('')}</div>
          <div class="sticky"><button class="pill red wide" data-a="confirmCreate" ${n >= MIN_PLAYERS ? '' : 'disabled'}>Crear partida amb ${n} jugadors</button>
          <button class="pill wide" data-a="cancelCreate">Tornar</button></div>`;
      }
      case 'lobby':
        return this.lobby(st!);
      case 'busy':
        return `${logo}<div class="cardbox"><p><b>Hi ha una partida en marxa i no hi jugues.</b></p><p>La porta ${esc(userById(st!.master).name)}. Quan s'acabi, en podràs crear una de nova.</p></div>${who}${mode}`;
    }
    return '';
  }

  private lobby(st: GameState): string {
    const me = this.me!;
    const isMaster = st.master === me;
    const invited = st.invited.includes(me);
    const joined = st.joined.includes(me);
    const all = st.invited.every((p) => st.joined.includes(p));
    this.order = this.order.filter((p) => st.joined.includes(p));
    const head = `<div class="logo">TARROJAPOLY</div><h2>Sala d'espera</h2>`;
    if (!invited) {
      return `${head}<div class="cardbox"><p>${esc(userById(st.master).name)} està preparant una partida i no hi ets. Quan s'acabi, en podràs crear una de nova.</p></div>
        <button class="link" data-a="switch">Canviar d'usuari</button>`;
    }
    const rows = st.invited
      .map((p) => {
        const pos = this.order.indexOf(p);
        const ok = st.joined.includes(p);
        const right = isMaster && all ? (pos >= 0 ? `<span class="num">${pos + 1}</span>` : '<small>toca per posar-lo</small>') : ok ? '<span class="ok">A punt</span>' : '<small>esperant…</small>';
        const tag = isMaster && all ? 'button' : 'div';
        return `<${tag} class="li" ${isMaster && all ? `data-a="orderTap" data-v="${p}"` : ''}>${avatar(p)}<span class="grow">${esc(userById(p).name)}${p === st.master ? ' <small>màster</small>' : ''}</span>${right}</${tag}>`;
      })
      .join('');
    let foot: string;
    if (!joined) {
      foot = `<button class="pill red wide" data-a="join">Unir-me a la partida</button>`;
    } else if (isMaster) {
      foot = all
        ? `<p class="lead" style="margin:0">Toca els jugadors en l'ordre en què tiraran.</p>
           <button class="pill red wide" data-a="start" ${this.order.length === st.invited.length ? '' : 'disabled'}>Començar la partida</button>
           <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="pill" data-a="shuffle">Ordre a l'atzar</button><button class="pill" data-a="clearOrder">Esborrar ordre</button></div>`
        : `<p class="lead" style="margin:0">Quan tothom s'hi hagi unit, triaràs l'ordre de torn.</p>`;
      foot += `<button class="link" data-a="cancelGame">Anul·lar la partida</button>`;
    } else {
      foot = `<p class="lead" style="margin:0">Ja hi ets. ${esc(userById(st.master).name)} triarà l'ordre de torn i començarà la partida.</p>`;
    }
    return `${head}<div class="list">${rows}</div><div class="sticky">${foot}<button class="link" data-a="switch">Ets ${esc(userById(me).name)}. Canviar d'usuari</button></div>`;
  }

  private async onClick(e: Event) {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!a || this.screenKind === 'table') return;
    const v = a.dataset.v ?? '';
    const me = this.me;
    switch (a.dataset.a) {
      case 'pickMe':
        return this.setMe(v);
      case 'switch':
        return this.setMe(null);
      case 'create':
        this.creating = true;
        this.picking = me ? [me] : [];
        return this.render();
      case 'cancelCreate':
        this.creating = false;
        return this.render();
      case 'togglePlayer':
        if (v === me) return;
        if (this.picking.includes(v)) this.picking = this.picking.filter((p) => p !== v);
        else if (this.picking.length < MAX_PLAYERS) this.picking.push(v);
        return this.render();
      case 'confirmCreate': {
        if (!me) return;
        try {
          const snap = await this.store.update((cur) => {
            if (cur && cur.status !== 'finished') throw new RuleError('Algú altre ja ha creat una partida');
            return createGame(me, this.picking, Date.now().toString(36));
          });
          this.creating = false;
          this.order = [];
          this.accept(snap);
        } catch (err) {
          this.creating = false;
          this.flash((err as Error).message);
          this.render();
        }
        return;
      }
      case 'join':
        return void this.act({ type: 'join' });
      case 'orderTap':
        this.order = this.order.includes(v) ? this.order.filter((p) => p !== v) : [...this.order, v];
        return this.render();
      case 'shuffle': {
        const st = this.snap.state!;
        this.order = [...st.joined].sort(() => Math.random() - 0.5);
        return this.render();
      }
      case 'clearOrder':
        this.order = [];
        return this.render();
      case 'start':
        return void this.act({ type: 'set-turn-order', order: this.order });
      case 'cancelGame':
        if (confirm('Segur que vols anul·lar la partida?')) void this.act({ type: 'end-game' });
        return;
    }
  }
}

function readMe(): string | null {
  try {
    const id = localStorage.getItem(ME_KEY);
    return id && USERS.some((u) => u.id === id) ? id : null;
  } catch {
    return null;
  }
}
