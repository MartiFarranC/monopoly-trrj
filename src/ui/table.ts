// La taula: la pantalla de joc. Ve de la maqueta aprovada i ara llegeix i escriu la partida real.

import { BOARD, getOwnable, isOwnable, unmortgageCost, type OwnableSquare } from '../data/board';
import { userById } from '../data/users';
import { walletTotal, type Denomination, type Wallet } from '../engine/bills';
import { BANK, currentPlayer, type GameState, type MasterRequest, type Party } from '../engine/game';
import {
  HOTEL,
  assertCanBuild,
  assertCanMortgage,
  assertCanSellBuilding,
  buildCost,
  rentFor,
} from '../engine/rules';
import type { App, Screen } from './app';
import { CHECK, COL, GROUP, VALS, avatar, billHtml, deedHtml, esc, fmt, groupKey, nameOf, sortKey, squareIcon } from './visual';

type V = Denomination;
const BW = 60;
const BH = 126;
const HW = 74;
const HH = 155;
/** Distància del pivot al peu del bitllet: com més gran, més pla és el ventall i més amplada ocupa. */
const HR = 375;
/** Pivot sota la pantalla: només en sobresurt la punta dels bitllets (uns 80px). */
const PIVOT_DEPTH = 450;
/** Obertura màxima entre dos bitllets, perquè amb pocs bitllets no quedin massa separats. */
const MAX_STEP = 6;
const DY_CARD = 26;
const TOP = 136;

/** Maneres de canviar un bitllet per de més petits, en ordre de preferència. */
const CHANGE: Partial<Record<V, V[][]>> = {
  500: [[100, 100, 100, 100, 100], [100, 100, 100, 100, 50, 50], [50, 50, 50, 50, 50, 50, 50, 50, 50, 50]],
  100: [[50, 50], [20, 20, 20, 20, 20], [50, 20, 20, 10]],
  50: [[20, 20, 10], [10, 10, 10, 10, 10]],
  20: [[10, 10], [5, 5, 5, 5]],
  10: [[5, 5], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
  5: [[1, 1, 1, 1, 1]],
};

interface Loose {
  id: string;
  v: V;
  x: number;
  y: number;
  rot: number;
  thrown?: boolean;
}

interface Stack {
  id: string;
  items: number[];
  x: number;
  y: number;
  rot: number;
  thrown?: boolean;
}

interface PaySheet {
  title: string;
  sub: string;
  /** Import a pagar; null quan només es vol canviar bitllets. */
  amount: number | null;
  to: Party | null;
  given: V[];
  mode: 'pay' | 'change';
  who: Party;
  dir: 'down' | 'up';
  last: string;
  waitOffer: string | null;
  enter: boolean;
  onPay?: (bills: Partial<Wallet>) => Promise<boolean>;
  /** Missatge en acabar; per defecte «Has pagat …». */
  done?: string;
}

interface Panel {
  html: () => string;
  on: Record<string, (v: string) => void>;
}

const count = (bills: V[]): Partial<Wallet> => {
  const w: Partial<Wallet> = {};
  bills.forEach((b) => (w[b] = (w[b] ?? 0) + 1));
  return w;
};
const billsTxt = (bills: V[]) =>
  VALS.filter((v) => bills.includes(v))
    .map((v) => {
      const n = bills.filter((x) => x === v).length;
      return (n === 1 ? 'un de ' : n + ' de ') + v + '€';
    })
    .join(' + ');
const rnd = (n: number) => Math.random() * n * 2 - n;

export class TableScreen implements Screen {
  readonly gameId: string;
  private st: GameState;
  private readonly me: string;
  private el: HTMLElement;
  private W = 0;
  private H = 0;
  private open: V | null = null;
  private loose: Loose[] = [];
  private stacks: Stack[] = [];
  private seen = new Set<string>();
  private seq = 0;
  private pay: PaySheet | null = null;
  private panel: Panel | null = null;
  private focus: number | null = null;
  private flip = false;
  private askPay: 'pick' | 'dice' | null = null;
  private diceFor: number | null = null;
  private menu = false;
  private overlay: 'dice' | 'chat' | null = null;
  private rolling = false;
  private chatSeen = '';
  private reqStatus = new Map<string, string>();
  private knownPayReqs = new Set<string>();
  private lastTurn = '';
  private offerStatus = new Map<string, string>();
  private handEls: Record<string, HTMLButtonElement> = {};
  private pcEls: Record<string, HTMLDivElement> = {};
  private GA: number[] = [];
  private drag: any = null;
  private toastT = 0;
  private resizeT = 0;
  private onResize = () => {
    clearTimeout(this.resizeT);
    this.resizeT = window.setTimeout(() => this.layout(), 150);
  };

  constructor(
    private app: App,
    root: HTMLElement,
    state: GameState,
  ) {
    this.st = state;
    this.gameId = state.id;
    this.me = app.me!;
    root.innerHTML = `<div class="shell"><main class="app">${this.skeleton()}</main></div>`;
    this.el = root.querySelector('.app')!;
    this.loadSeen();
    this.chatSeen = state.chat.at(-1)?.id ?? '';
    state.requests.forEach((r) => this.reqStatus.set(r.id, r.status));
    state.exchangeOffers.forEach((o) => this.offerStatus.set(o.id, o.status));
    state.paymentRequests.forEach((r) => this.knownPayReqs.add(r.id));
    this.lastTurn = currentPlayer(state) ?? '';
    this.bind();
    window.addEventListener('resize', this.onResize);
    requestAnimationFrame(() => {
      this.layout();
      this.update(state, true);
    });
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
  }

  private $(sel: string) {
    return this.el.querySelector<HTMLElement>(sel)!;
  }

  private skeleton() {
    const u = userById(this.me);
    return `
    <button class="btn" data-a="roll" aria-label="Tirar els daus" style="left:14px;top:calc(16px + env(safe-area-inset-top,0px))">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke="#151515" stroke-width="2"/><circle cx="8" cy="8" r="1.7" fill="#151515"/><circle cx="16" cy="8" r="1.7" fill="#151515"/><circle cx="12" cy="12" r="1.7" fill="#151515"/><circle cx="8" cy="16" r="1.7" fill="#151515"/><circle cx="16" cy="16" r="1.7" fill="#151515"/></svg></button>
    <button class="btn" data-a="chat" aria-label="Xat" style="left:14px;top:calc(72px + env(safe-area-inset-top,0px))">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#151515" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4.5V16H6.5"/></svg><span class="badge" id="chatBadge" hidden></span></button>
    <div class="mid" style="top:calc(14px + env(safe-area-inset-top,0px))"><button class="turn" data-a="turn" id="turn"></button>
      <div class="bal" data-a="money" role="button" aria-label="Els teus diners"><span id="total"></span><small>€</small></div>
      <div class="midrow"><button class="sort" data-a="sort"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="2" width="4" height="5" rx="1" fill="#5B3726"/><rect x="6" y="2" width="4" height="5" rx="1" fill="#2E9DE6"/><rect x="11" y="2" width="4" height="5" rx="1" fill="#E24FC2"/><rect x="1" y="9" width="4" height="5" rx="1" fill="#E8672C"/><rect x="6" y="9" width="4" height="5" rx="1" fill="#2F9A2F"/><rect x="11" y="9" width="4" height="5" rx="1" fill="#2341E0"/></svg>Ordenar</button><button class="sort endturn" data-a="endTurn" id="endTurn" hidden>Acabar el torn</button></div></div>
    <div class="wallet" id="wallet" aria-hidden="true"></div>
    <button class="btn" data-a="profile" aria-label="Perfil" style="right:14px;top:calc(16px + env(safe-area-inset-top,0px));border-radius:50%;background:${u.color};color:#fff;font-size:17px;font-weight:700">${esc(u.name.slice(0, 1))}</button>
    <button class="btn" id="menuBtn" data-a="menu" aria-label="Menú" aria-expanded="false" style="right:14px;top:calc(72px + env(safe-area-inset-top,0px))">
      <svg width="20" height="20" viewBox="0 0 20 20" stroke="#151515" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14"/></svg><span class="badge" id="menuBadge" hidden></span></button>
    <div class="wm" aria-hidden="true">TARROJAPOLY</div>
    <div class="empty-table" id="emptyTable" hidden>Encara no tens cap propietat. Quan caiguis en una casella lliure, demana-la al màster des del menú.</div>
    <div id="pieces"></div>
    <div id="hand"></div>
    <div class="inbox" id="inbox"></div>
    <div id="toast"></div>
    <div id="pay"></div>
    <div id="menu"></div>
    <div id="ov"></div>
    <div id="auc"></div>`;
  }

  // ---------- dades ----------

  private get wallet(): Wallet {
    return this.st.wallets[this.me]!;
  }
  private get isMaster() {
    return this.st.master === this.me;
  }
  private others() {
    return this.st.turnOrder.filter((p) => p !== this.me);
  }
  /** Bitllets a la mà: els de la cartera menys els que encara són a la taula o a la safata de pagar. */
  private handCount(v: V): number {
    return this.wallet[v] - this.loose.filter((b) => b.v === v).length - (this.pay ? this.pay.given.filter((x) => x === v).length : 0);
  }
  private myDeeds(): number[] {
    return Object.entries(this.st.deeds)
      .filter(([, d]) => d.owner === this.me)
      .map(([i]) => Number(i));
  }
  private dice(): number | undefined {
    return this.st.lastDice ? this.st.lastDice[0] + this.st.lastDice[1] : undefined;
  }
  private rent(index: number): number | null {
    try {
      return rentFor(this.st.deeds, index, this.dice());
    } catch {
      return null;
    }
  }

  private seenKey() {
    return `tarrojapoly:vist:${this.gameId}:${this.me}`;
  }
  private loadSeen() {
    let saved: string[] | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(this.seenKey()) ?? 'null');
    } catch {
      saved = null;
    }
    // La primera vegada no llancem els diners antics a la taula: ja són a la mà.
    (saved ?? this.st.transactions.map((t) => t.id)).forEach((id) => this.seen.add(id));
  }
  private saveSeen() {
    try {
      localStorage.setItem(this.seenKey(), JSON.stringify([...this.seen].slice(-400)));
    } catch {
      // No passa res: com a molt es tornarien a veure caure uns bitllets.
    }
  }

  // ---------- actualització des de la partida ----------

  update(state: GameState, first = false) {
    this.st = state;

    // Diners que t'arriben: cauen a la taula tots alhora, una sola vegada.
    const incoming = state.transactions.filter((t) => !this.seen.has(t.id));
    incoming.forEach((t) => this.seen.add(t.id));
    if (incoming.length) this.saveSeen();
    const paidToMe = incoming.filter((t) => t.to === this.me && t.amount > 0 && t.from !== this.me);
    const bills: V[] = [];
    paidToMe.forEach((t) => VALS.forEach((v) => bills.push(...Array<V>(t.bills[v]).fill(v))));
    if (bills.length) {
      this.throwBills(bills);
      const t = paidToMe[paidToMe.length - 1]!;
      const from = t.from === BANK ? 'La banca' : userById(t.from).name;
      this.toast('pay', `${from} t'ha pagat ${fmt(paidToMe.reduce((n, x) => n + x.amount, 0))}€`, `${esc(t.reason)}. Arrossega els bitllets al ventall.`, 5000);
    }

    // Respostes del màster a les teves peticions.
    state.requests.forEach((r) => {
      const before = this.reqStatus.get(r.id);
      this.reqStatus.set(r.id, r.status);
      if (first || r.player !== this.me || before !== 'pending' || r.status === 'pending' || r.player === state.master) return;
      if (r.status === 'rejected') this.toast('info', 'El màster ha rebutjat la petició', describeRequest(r), 4500);
      else if (r.kind !== 'buy') this.toast('ok', 'El màster ha acceptat la petició', describeRequest(r), 4000);
    });
    state.exchangeOffers.forEach((o) => {
      const before = this.offerStatus.get(o.id);
      this.offerStatus.set(o.id, o.status);
      if (first || o.from !== this.me || before !== 'pending' || o.status === 'pending') return;
      if (this.pay?.waitOffer === o.id) {
        this.pay.waitOffer = null;
        this.pay.last = o.status === 'accepted' ? `${userById(o.to).name} t'ha canviat ${billsTxt(expand(o.give))} per ${billsTxt(expand(o.receive))}` : '';
      }
      if (o.status === 'accepted') this.toast('ok', `${userById(o.to).name} ha acceptat el canvi`, `${billsTxt(expand(o.give))} per ${billsTxt(expand(o.receive))}.`, 3500);
      else if (o.status === 'rejected') this.toast('info', `${userById(o.to).name} no vol fer el canvi`, 'Prova-ho amb la banca o amb algú altre.', 3500);
    });

    // Avisos forts: et toca pagar, o et toca tirar.
    const newDebts = state.paymentRequests.filter((r) => r.debtor === this.me && r.status === 'pending' && !this.knownPayReqs.has(r.id));
    state.paymentRequests.forEach((r) => this.knownPayReqs.add(r.id));
    const turn = currentPlayer(state) ?? '';
    const myTurnNow = !first && turn === this.me && this.lastTurn !== this.me;
    this.lastTurn = turn;
    if (!first && newDebts.length) {
      const r = newDebts[newDebts.length - 1]!;
      buzz([200, 100, 200]);
      this.toast('info', `Has de pagar ${fmt(r.amount)}€ a ${nameOf(r.creditor)}`, 'Toca «Pagar» a l\u2019avís de dalt.', 5000);
    } else if (myTurnNow) {
      buzz([120]);
      this.toast('ok', 'És el teu torn!', 'Tira els daus. Quan acabis, toca «Acabar el torn».', 4500);
    }

    this.syncStacks(first);
    if (this.pay && this.pay.given.some((v) => this.handCount(v) < 0)) this.pay.given = [];
    this.drawPieces();
    this.drawHand();
    this.drawTop();
    this.drawInbox();
    this.drawPay();
    this.drawFocus();
    this.drawAuction();
    if (this.overlay === 'chat') this.drawChat();
    if (this.menu) this.drawMenu();
  }

  private syncStacks(first: boolean) {
    const mine = new Set(this.myDeeds());
    const placed = new Set(this.stacks.flatMap((s) => s.items));
    this.stacks.forEach((s) => (s.items = s.items.filter((i) => mine.has(i))));
    this.stacks = this.stacks.filter((s) => s.items.length);
    const fresh = [...mine].filter((i) => !placed.has(i));
    if (!fresh.length) return;
    if (first || !this.W) {
      this.sortCards(false);
      return;
    }
    fresh.forEach((i, k) => {
      this.stacks.push({ id: 'n' + ++this.seq, items: [i], x: Math.round(this.W - 108 - k * 20), y: Math.round(this.H * 0.3), rot: -7, thrown: true });
    });
    const name = getOwnable(fresh[0]!).name;
    this.toast('ok', fresh.length === 1 ? `${name} ja és teva` : `Tens ${fresh.length} propietats noves`, 'Arrossega la carta on vulguis, o toca «Ordenar».', 5000);
  }

  // ---------- dibuix ----------

  private layout() {
    this.W = this.el.clientWidth;
    this.H = this.el.clientHeight;
    if (!this.stacks.length) this.sortCards(false);
    this.drawPieces();
    this.drawHand();
  }

  private pivot() {
    return { x: this.W / 2, y: this.H + PIVOT_DEPTH };
  }

  private drawHand(hitV: V | null = null, glowV: V | null = null) {
    if (!this.W) return;
    const P = this.pivot();
    const keep = new Set<string>();
    const anyOpen = this.open !== null;
    const GAP = 3.4;
    const counts = VALS.map((v) => Math.max(this.handCount(v), 1));
    const units = counts.reduce((a, n) => a + n, 0) - 1 + GAP * (VALS.length - 1);
    const paying = !!this.pay;
    // El ventall ocupa tota l'amplada de baix: l'angle total es calcula perquè les puntes arribin a les vores.
    const reach = Math.max(40, this.W / 2 - HW / 2 - 10);
    const span = (2 * Math.asin(Math.min(1, reach / (HR + HH))) * 180) / Math.PI;
    const step = Math.min(MAX_STEP, span / Math.max(units, 1));
    let a0 = (-step * units) / 2;
    let z = 0;
    this.GA = [];
    const hand = this.$('#hand');
    hand.classList.toggle('paying', paying);
    this.$('#wallet').hidden = paying;
    VALS.forEach((v, g) => {
      const n = this.handCount(v);
      const open = this.open === v;
      const c = counts[g]!;
      this.GA[g] = a0 + (step * (c - 1)) / 2;
      for (let k = 0; k < c; k++) {
        const key = v + ':' + k;
        keep.add(key);
        let el = this.handEls[key];
        if (!el) {
          el = document.createElement('button');
          el.className = 'hb';
          el.dataset.slot = String(v);
          el.innerHTML = billHtml(v) + '<span class="lab"></span>';
          el.style.transform = `rotate(${this.GA[g]}deg) translateY(200px)`;
          hand.appendChild(el);
          this.handEls[key] = el;
        }
        let a: number;
        let lift: number;
        if (open) {
          const st = Math.min(5.5, 30 / Math.max(n - 1, 1));
          a = this.GA[g]! * 0.5 + (k - (n - 1) / 2) * st;
          lift = -95;
        } else {
          a = a0 + k * step;
          lift = anyOpen ? 36 : 0;
        }
        Object.assign(el.style, {
          left: P.x - HW / 2 + 'px',
          top: P.y - HR - HH + 'px',
          transformOrigin: `${HW / 2}px ${HR + HH}px`,
          zIndex: String(open ? 200 + k : z++),
        });
        const target = `rotate(${a}deg) translateY(${lift}px)`;
        requestAnimationFrame(() => (el!.style.transform = target));
        el.classList.toggle('ghost', n <= 0);
        el.classList.toggle('glow', glowV === v);
        el.classList.toggle('hit', hitV === v && k === 0);
        el.setAttribute('aria-label', `${Math.max(n, 0)} bitllets de ${v}€`);
        const lab = el.querySelector<HTMLElement>('.lab')!;
        lab.hidden = k !== 0;
        lab.textContent = '×' + Math.max(n, 0);
      }
      a0 += step * (c - 1 + GAP);
    });
    Object.keys(this.handEls).forEach((k) => {
      if (!keep.has(k)) {
        this.handEls[k]!.remove();
        delete this.handEls[k];
      }
    });
    this.$('#total').textContent = fmt(walletTotal(this.wallet));
    this.drawWallet();
  }

  /** Recompte de bitllets per tipus, sempre visible a sobre del ventall. */
  private drawWallet() {
    this.$('#wallet').innerHTML = VALS.map((v) => {
      const n = this.wallet[v];
      return `<span class="${n ? '' : 'none'}" style="--bc:${COL[v]}"><b>${v}€</b>×${n}</span>`;
    }).join('');
  }

  private pieceEl(key: string, html: string, model: { thrown?: boolean }) {
    let el = this.pcEls[key];
    if (!el) {
      el = document.createElement('div');
      el.className = 'pc rest';
      if (model.thrown) {
        el.classList.add('thrown');
        el.style.setProperty('--tx', Math.round(120 + rnd(90)) + 'px');
        model.thrown = false;
      }
      this.$('#pieces').appendChild(el);
      this.pcEls[key] = el;
    }
    if (el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
    }
    el.classList.remove('lifted');
    return el;
  }

  private drawPieces() {
    if (!this.W) return;
    const keep = new Set<string>();
    let z = 10;
    this.stacks.forEach((s) =>
      s.items.forEach((id, i) => {
        const key = 'c' + id;
        keep.add(key);
        const el = this.pieceEl(key, deedHtml(id, this.st.deeds[id], this.rent(id)), s);
        Object.assign(el.dataset, { k: 'card', s: s.id, i: String(i) });
        Object.assign(el.style, { left: s.x + 'px', top: s.y + i * DY_CARD + 'px', zIndex: String(z++) });
        el.style.setProperty('--rot', (s.rot || 0) + 'deg');
      }),
    );
    this.loose.forEach((b) => {
      const key = 'b' + b.id;
      keep.add(key);
      const el = this.pieceEl(key, billHtml(b.v), b);
      Object.assign(el.dataset, { k: 'bill', b: b.id });
      Object.assign(el.style, { left: b.x + 'px', top: b.y + 'px', zIndex: String(150 + z++) });
      el.style.setProperty('--rot', b.rot + 'deg');
    });
    Object.keys(this.pcEls).forEach((k) => {
      if (!keep.has(k)) {
        this.pcEls[k]!.remove();
        delete this.pcEls[k];
      }
    });
    this.$('#emptyTable').hidden = this.stacks.length > 0 || this.loose.length > 0;
  }

  private drawTop() {
    const cur = currentPlayer(this.st)!;
    const d = this.st.lastDice;
    const dice = d ? `<span class="dicechip">${d[0]}+${d[1]} = ${d[0] + d[1]}</span>` : '';
    this.$('#turn').innerHTML = `${avatar(cur)}${cur === this.me ? 'El teu torn' : 'Torn de ' + esc(userById(cur).name)}${dice}`;
    this.$('#turn').classList.toggle('mine', cur === this.me);
    this.$('#endTurn').hidden = cur !== this.me;
    const unread = this.st.chat.filter((m) => m.author !== this.me);
    const idx = unread.findIndex((m) => m.id === this.chatSeen);
    const n = this.overlay === 'chat' ? 0 : this.chatSeen ? unread.length - 1 - idx : unread.length;
    const badge = this.$('#chatBadge');
    badge.hidden = n <= 0 || idx === unread.length - 1;
    badge.textContent = String(Math.min(n, 9));
    const pend = this.isMaster ? this.pendingRequests().length : 0;
    const mb = this.$('#menuBadge');
    mb.hidden = pend === 0;
    mb.textContent = String(pend);
  }

  private pendingRequests() {
    return this.st.requests.filter((r) => r.status === 'pending');
  }

  private drawInbox() {
    const notes: string[] = [];
    const st = this.st;
    if (!this.pay && this.focus === null && !this.panel) {
      st.paymentRequests
        .filter((r) => r.debtor === this.me && r.status === 'pending')
        .forEach((r) => {
          const who = r.creditor === BANK ? 'La banca' : userById(r.creditor).name;
          const what = r.auction ? `Has guanyat la subhasta de ${getOwnable(r.square!).name}` : r.square !== undefined ? `Lloguer de ${getOwnable(r.square).name}` : 'Et demana diners';
          notes.push(`<div class="note urgent">${r.creditor === BANK ? '<span class="av" style="background:#F2A65A;color:#151515">€</span>' : avatar(r.creditor)}<div><small>HAS DE PAGAR</small><b>${fmt(r.amount)}€ a ${esc(r.creditor === BANK ? 'la banca' : who)}</b><span>${esc(what)}</span></div>
            <button class="pill red" data-a="payReq" data-v="${r.id}">Pagar</button></div>`);
        });
      st.exchangeOffers
        .filter((o) => o.to === this.me && o.status === 'pending')
        .forEach((o) => {
          notes.push(`<div class="note">${avatar(o.from)}<div><b>${esc(userById(o.from).name)} vol canviar</b><span>Et dona ${billsTxt(expand(o.give))} per ${billsTxt(expand(o.receive))}</span></div>
            <div class="acts"><button class="pill" data-a="offerNo" data-v="${o.id}">No</button><button class="pill red" data-a="offerYes" data-v="${o.id}">Sí</button></div></div>`);
        });
      if (this.isMaster) {
        const pend = this.pendingRequests();
        if (pend.length) {
          const r = pend[0]!;
          notes.push(`<div class="note">${avatar(r.player)}<div><b>${esc(userById(r.player).name)}: ${esc(describeRequest(r))}</b><span>${pend.length > 1 ? `I ${pend.length - 1} peticions més` : 'Ets el màster: tu decideixes'}</span></div>
            <div class="acts"><button class="pill" data-a="reqNo" data-v="${r.id}">No</button><button class="pill red" data-a="reqYes" data-v="${r.id}">Sí</button></div></div>`);
        }
      }
      const mineWaiting = st.requests.filter((r) => r.player === this.me && r.status === 'pending');
      if (mineWaiting.length) {
        notes.push(`<div class="note"><span class="av" style="background:#fff;color:#151515">…</span><div><b>Esperant el màster</b><span>${esc(describeRequest(mineWaiting[0]!))}</span></div></div>`);
      }
    }
    this.$('#inbox').innerHTML = notes.slice(0, 3).join('');
  }

  toast(kind: 'ok' | 'pay' | 'info', title: string, sub: string, ms: number) {
    const bg = kind === 'ok' ? 'var(--ok)' : kind === 'pay' ? '#F2A65A' : 'var(--red)';
    const icon = kind === 'pay' ? '<b style="font-size:14px;color:#151515">€</b>' : kind === 'ok' ? CHECK : '<b style="color:#fff">!</b>';
    this.$('#toast').innerHTML = `<div class="toast"><span class="ic" style="background:${bg}">${icon}</span><div><b>${esc(title)}</b><span>${sub}</span></div></div>`;
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => (this.$('#toast').innerHTML = ''), ms);
  }

  // ---------- bitllets i cartes a la taula ----------

  private throwBills(parts: V[]) {
    const W = this.W || 380;
    const H = this.H || 760;
    const n = parts.length;
    const gap = Math.min(74, (W - 80) / Math.max(n, 1));
    parts.forEach((v, k) =>
      this.loose.push({
        id: 'f' + ++this.seq,
        v,
        thrown: true,
        rot: Math.round(rnd(16)),
        x: Math.round(W / 2 - BW / 2 + (k - (n - 1) / 2) * gap + rnd(6)),
        y: Math.round(H * 0.44 + rnd(18)),
      }),
    );
  }

  private sortCards(animate = true) {
    const W = this.W || 380;
    const groups = new Map<number, number[]>();
    this.myDeeds().forEach((id) => {
      const g = groupKey(id);
      groups.set(g, [...(groups.get(g) ?? []), id]);
    });
    const keys = [...groups.keys()].sort((a, b) => a - b);
    const cols = Math.max(1, Math.min(4, Math.floor((W - 12) / 92)));
    const x0 = (W - (cols * 84 + (cols - 1) * 8)) / 2;
    let y = TOP;
    let rowH = 0;
    this.stacks = keys.map((g, i) => {
      const c = i % cols;
      if (i && !c) {
        y += rowH + 12;
        rowH = 0;
      }
      const items = groups.get(g)!.sort((a, b) => sortKey(a) - sortKey(b));
      rowH = Math.max(rowH, 118 + (items.length - 1) * DY_CARD);
      return { id: 'g' + g, items, x: Math.round(x0 + c * 92), y, rot: 0 };
    });
    if (!animate) return;
    this.$('#pieces').classList.add('sorting');
    this.drawPieces();
    setTimeout(() => this.$('#pieces').classList.remove('sorting'), 700);
  }

  // ---------- pagar i canviar ----------

  private openPay(sheet: Omit<PaySheet, 'given' | 'mode' | 'who' | 'dir' | 'last' | 'waitOffer' | 'enter'> & { mode?: 'pay' | 'change' }) {
    this.closeAll();
    this.open = null;
    this.pay = { given: [], mode: 'pay', who: BANK, dir: 'down', last: '', waitOffer: null, enter: true, ...sheet };
    this.drawHand();
    this.drawPay();
    this.drawInbox();
  }

  private drawPay() {
    const p = this.pay;
    const el = this.$('#pay');
    if (!p) {
      el.innerHTML = this.panel ? `<div class="paybox sheet enter">${this.panel.html()}</div>` : '';
      return;
    }
    const sum = p.given.reduce((a, v) => a + v, 0);
    const who = p.who === BANK ? 'la banca' : userById(p.who).name;
    const Who = p.who === BANK ? 'La banca' : userById(p.who).name;
    let body: string;
    if (p.mode === 'change' || p.amount === null) {
      const msg = p.waitOffer
        ? `Esperant que ${esc(who)} accepti el canvi…`
        : p.last
          ? `${esc(p.last)}. Toca un altre bitllet si en vols canviar més.`
          : p.dir === 'down'
            ? `Toca un bitllet del teu ventall i ${esc(who)} te'l canvia per bitllets més petits.`
            : `Toca un grup de bitllets petits del teu ventall i ${esc(who)} te'ls canvia per un de més gran (per exemple, deu d'1€ per un de 10€).`;
      const stock = p.who === BANK ? this.st.bank : this.st.wallets[p.who]!;
      body = `<div class="chips"><span>Amb</span>${[BANK, ...this.others()]
        .map((k) => `<button data-a="payWho" data-v="${k}" class="${p.who === k ? 'on' : ''}">${k === BANK ? 'Banca' : esc(userById(k).name)}</button>`)
        .join('')}</div>
        <div class="chips"><span>Vull</span><button data-a="payDir" data-v="down" class="${p.dir === 'down' ? 'on' : ''}">Més petits</button><button data-a="payDir" data-v="up" class="${p.dir === 'up' ? 'on' : ''}">Més grans</button></div>
        <p>${msg}</p><div class="bank"><span>${esc(Who)} té</span>${VALS.map((v) => `<i style="--bc:${COL[v]}" class="${stock[v] ? '' : 'out'}">${v}€ <b>×${stock[v]}</b></i>`).join('')}</div>`;
    } else {
      const msg =
        sum < p.amount
          ? `Toca els bitllets del teu ventall per posar-los aquí. Falten <b>${fmt(p.amount - sum)}€</b>.`
          : sum > p.amount
            ? `T'has passat <b>${fmt(sum - p.amount)}€</b>. Només es pot pagar just: treu algun bitllet o demana canvi.`
            : `Just. ${p.to === BANK ? 'La banca' : esc(nameOf(p.to!))} rep ${fmt(p.amount)}€.`;
      body = `<div class="tray">${
        p.given.length
          ? p.given.map((v, i) => `<button class="mini" data-a="unGive" data-v="${i}" aria-label="Treure ${v}€">${billHtml(v)}</button>`).join('')
          : '<span class="empty">Aquí hi van els bitllets</span>'
      }</div><div class="sum">Hi has posat <b>${fmt(sum)}€</b> de ${fmt(p.amount)}€</div><p>${msg}</p>`;
    }
    const enter = p.enter;
    p.enter = false;
    const head = p.to && p.to !== BANK ? avatar(p.to) : '<span class="av" style="background:#F2A65A;color:#151515">€</span>';
    const seg =
      p.amount === null
        ? ''
        : `<div class="seg"><button data-a="payMode" data-v="pay" class="${p.mode === 'pay' ? 'on' : ''}">Triar bitllets</button><button data-a="payMode" data-v="change" class="${p.mode === 'change' ? 'on' : ''}">Demanar canvi</button></div>`;
    const go =
      p.amount === null
        ? `<button class="pill red" data-a="payCancel">Fet</button>`
        : `<button class="pill red" data-a="payGo" ${p.mode === 'pay' && sum === p.amount ? '' : 'disabled'}>Pagar ${fmt(p.amount)}€</button>`;
    el.innerHTML = `<div class="paybox sheet ${enter ? 'enter' : ''}" role="dialog" aria-label="${esc(p.title)}">
      <div class="ph">${head}<div><small>${esc(p.sub)}</small><b>${esc(p.title)}</b></div></div>${seg}${body}
      <div class="row"><button class="pill" data-a="payCancel">${p.amount === null ? 'Tancar' : 'Cancel·lar'}</button>${go}</div></div>`;
  }

  private async payGive(v: V) {
    const p = this.pay!;
    if (this.handCount(v) <= 0) {
      this.toast('info', `No et queden bitllets de ${v}€ al ventall`, this.loose.length ? 'Recull primer els bitllets de la taula.' : 'Tria un altre bitllet.', 2400);
      return;
    }
    if (p.mode === 'pay' && p.amount !== null) {
      p.given.push(v);
      this.drawHand();
      this.drawPay();
      return;
    }
    if (p.waitOffer) return;
    const stock = p.who === BANK ? this.st.bank : this.st.wallets[p.who]!;
    const who = p.who === BANK ? 'la banca' : userById(p.who).name;
    let give: V[];
    let get: V[];
    if (p.dir === 'down') {
      const opts = CHANGE[v];
      if (!opts) return this.toast('info', "L'1€ no es pot canviar per més petits", 'Ja és el bitllet més petit.', 2400);
      const found = opts.find((o) => VALS.every((x) => o.filter((y) => y === x).length <= stock[x]));
      if (!found) return this.toast('info', `${cap(who)} no té canvi per a ${v}€`, 'Prova-ho amb una altra persona.', 2600);
      give = [v];
      get = found;
    } else {
      const n = this.handCount(v);
      const ups = VALS.filter((u) => u > v && u % v === 0 && u / v <= n);
      if (!ups.length) return this.toast('info', `Amb ${n} de ${v}€ no en fas un de més gran`, `Necessites més bitllets de ${v}€.`, 2600);
      const u = ups.find((x) => stock[x] > 0);
      if (!u) return this.toast('info', `${cap(who)} no té bitllets més grans`, 'Prova-ho amb una altra persona.', 2600);
      give = Array<V>(u / v).fill(v);
      get = [u];
    }
    const txt = `${billsTxt(give)} per ${billsTxt(get)}`;
    if (p.who === BANK) {
      const ok = await this.app.act({ type: 'exchange-bills', give: count(give), receive: count(get) });
      if (ok && this.pay) {
        this.pay.last = `La banca t'ha canviat ${txt}`;
        this.drawPay();
        this.drawHand(get[0]!);
        setTimeout(() => this.drawHand(), 500);
      }
      return;
    }
    const ok = await this.app.act({ type: 'propose-exchange', to: p.who, give: count(give), receive: count(get) });
    if (ok && this.pay) {
      const offer = [...this.st.exchangeOffers].reverse().find((o) => o.from === this.me && o.status === 'pending');
      this.pay.waitOffer = offer?.id ?? null;
      this.pay.last = '';
      this.drawPay();
    }
  }

  // ---------- targetes ampliades ----------

  private drawFocus() {
    const ov = this.$('#ov');
    if (this.overlay) return;
    if (this.focus === null) {
      ov.innerHTML = '';
      return;
    }
    const idx = this.focus;
    const sq = getOwnable(idx);
    const deed = this.st.deeds[idx];
    if (!deed || deed.owner !== this.me) {
      this.focus = null;
      ov.innerHTML = '';
      return;
    }
    const rn = this.rent(idx);
    const row = (k: string, v: string, cur = false) => `<div class="tr ${cur ? 'cur' : ''}"><span>${k}</span><b>${v}</b></div>`;
    const hs = (n: number) => `<span class="hs">${n === 5 ? '<i class="ht"></i>' : '<i></i>'.repeat(n)}</span>`;
    let front: string;
    if (sq.kind === 'street') {
      const g = GROUP[sq.group];
      front = `<div class="fh" style="background:${g.band};color:${g.ink}">${esc(sq.name)}</div><div class="fbuy">Preu de compra: ${sq.price}€</div>
        <div class="tbl"><div class="lh">Lloguer</div>${row('Lloguer', sq.rent[0] + '€', deed.buildings === 0 && rn === sq.rent[0])}${row('Grup de color', sq.rent[0] * 2 + '€', deed.buildings === 0 && rn === sq.rent[0] * 2)}
        ${[1, 2, 3, 4, 5].map((n) => row(hs(n) + (n === 5 ? 'Amb hotel' : n === 1 ? 'Amb 1 casa' : `Amb ${n} cases`), fmt(sq.rent[n]!) + '€', deed.buildings === n)).join('')}
        <div class="sep"></div>${row('Cost de cada casa', sq.houseCost + '€')}${row("Cost de l'hotel", sq.houseCost + '€')}${row('Hipoteca', sq.price / 2 + '€')}</div>`;
    } else if (sq.kind === 'station') {
      const owned = BOARD.filter((s) => s.kind === 'station' && this.st.deeds[s.index]?.owner === this.me).length;
      front = `<div class="fst">${squareIcon(sq, 54)}${esc(sq.name)}</div><div class="tbl"><div class="lh">Lloguer</div>${row('Lloguer', '25€', owned === 1)}${row('Si té 2 Estacions', '50€', owned === 2)}${row('Si té 3 Estacions', '100€', owned === 3)}${row('Si té 4 Estacions', '200€', owned === 4)}
        <div class="sep"></div>${row('Valor de la Hipoteca', sq.price / 2 + '€')}</div>`;
    } else {
      const owned = BOARD.filter((s) => s.kind === 'utility' && this.st.deeds[s.index]?.owner === this.me).length;
      front = `<div class="fst">${squareIcon(sq, 54)}${esc(sq.name)}</div><div class="tbl"><div class="lh">Lloguer</div>${row('Amb 1 servei', '4 × daus', owned === 1)}${row('Amb els 2 serveis', '10 × daus', owned === 2)}
        <div class="sep"></div>${row('Valor de la Hipoteca', sq.price / 2 + '€')}</div>`;
    }
    let actions: string;
    if (this.askPay === 'dice') {
      actions = `<div class="cardbox" style="width:100%;max-width:300px;padding:12px"><p style="font-size:13px;font-weight:600;color:var(--muted)">Quant han tret els daus?</p>
        <div class="chips">${Array.from({ length: 11 }, (_, i) => i + 2).map((n) => `<button data-a="diceFor" data-v="${n}">${n}</button>`).join('')}</div>
        <button class="pill" data-a="askBack">Tornar</button></div>`;
    } else if (this.askPay === 'pick') {
      const amount = rn ?? (this.diceFor ? rentFor(this.st.deeds, idx, this.diceFor) : 0);
      actions = `<div class="cardbox" style="width:100%;max-width:300px;padding:12px;gap:8px"><div style="font-size:13px;font-weight:600;color:var(--muted)">Qui ha caigut a ${esc(sq.name)}?</div>
        ${this.others().map((p) => `<button class="li" data-a="payTo" data-v="${p}">${avatar(p)}<span class="grow">${esc(userById(p).name)}</span><span>${fmt(amount)}€</span></button>`).join('')}
        <button class="pill" data-a="askBack">Tornar</button></div>`;
    } else {
      const extra: string[] = [];
      if (deed.mortgaged) extra.push(`<button class="pill" data-a="cardUnmortgage">Aixecar hipoteca · ${unmortgageCost(sq)}€</button>`);
      else {
        if (sq.kind === 'street' && canDo(() => assertCanBuild(this.st.deeds, idx, this.me)))
          extra.push(`<button class="pill" data-a="cardBuild">${deed.buildings === 4 ? 'Posar hotel' : 'Posar casa'} · ${buildCost(idx)}€</button>`);
        if (sq.kind === 'street' && canDo(() => assertCanSellBuilding(this.st.deeds, idx, this.me)))
          extra.push(`<button class="pill" data-a="cardSell">${deed.buildings === HOTEL ? "Vendre l'hotel" : 'Vendre una casa'}</button>`);
        if (canDo(() => assertCanMortgage(this.st.deeds, idx, this.me))) extra.push(`<button class="pill" data-a="cardMortgage">Hipotecar · ${sq.price / 2}€</button>`);
      }
      const payLabel = deed.mortgaged ? 'Hipotecada: no cobra lloguer' : `Sol·licitar paga${rn !== null ? ' · ' + fmt(rn) + '€' : ''}`;
      actions = `<div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:300px">
        <button class="pill red" data-a="askPay" ${deed.mortgaged || rn === 0 ? 'disabled' : ''}>${payLabel}</button>
        ${extra.length ? `<div style="display:grid;grid-template-columns:${extra.length > 1 ? '1fr 1fr' : '1fr'};gap:10px">${extra.join('')}</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="pill" data-a="flip">Girar</button><button class="pill" data-a="closeFocus">Tornar</button></div></div>`;
    }
    const flipped = this.flip !== deed.mortgaged;
    ov.innerHTML = `<div class="ov" style="overflow-y:auto;justify-content:flex-start;padding-top:calc(40px + env(safe-area-inset-top,0px))"><button data-a="flip" aria-label="Girar la carta" class="zoom" style="width:240px;height:322px;border:0;padding:0;background:none;perspective:1000px;flex-shrink:0">
      <div class="flipper ${flipped ? 'flip' : ''}"><div class="face fc">${front}</div>
      <div class="face" style="transform:rotateY(180deg);background:#fff;border:1.5px solid #151515;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:22px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,.25)">
        <span style="font-size:15px;font-weight:800;text-transform:uppercase">${esc(sq.name)}</span><span style="font-size:22px;font-weight:800;color:var(--red)">HIPOTECADA</span><span style="font-size:15px">per ${sq.price / 2}€</span>
        <span style="font-size:11px;color:var(--muted);line-height:1.4">Si la propietat està hipotecada, la carta es posa d'aquesta cara</span></div>
      </div></button>${actions}</div>`;
  }

  private drawAuction() {
    const el = this.$('#auc');
    const a = this.st.auction;
    if (!a) {
      el.innerHTML = '';
      return;
    }
    const sq = getOwnable(a.square);
    const top = a.bids.at(-1);
    const best = top ? `${fmt(top.amount)}€` : 'Cap puja';
    const who = top ? (top.player === this.me ? 'La puja més alta és teva' : `Va guanyant ${esc(userById(top.player).name)}`) : 'Comença tu!';
    const base = top?.amount ?? 0;
    el.innerHTML = `<div class="ov" style="z-index:650"><div class="auction"><small style="font-weight:800;letter-spacing:1px;color:var(--muted)">SUBHASTA</small>
      <div class="zoom">${deedHtml(a.square, undefined, sq.kind === 'street' ? sq.rent[0] : sq.kind === 'station' ? 25 : null)}</div>
      <div class="big">${best}</div><div class="who">${who}</div>
      <div class="bids">${[1, 10, 50, 100].map((n) => `<button class="pill" data-a="bid" data-v="${base + n}">+${n}</button>`).join('')}</div>
      <span style="font-size:12px;color:var(--muted);text-align:center">El preu de compra de ${esc(sq.name)} és ${sq.price}€. Qui guanyi pagarà just a la banca.</span>
      ${this.isMaster ? `<button class="pill red wide" data-a="closeAuction">Tancar la subhasta</button>` : ''}</div></div>`;
  }

  private drawDice(rolling: boolean, d: [number, number]) {
    const pips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    this.$('#ov').innerHTML = `<button class="ov" data-a="closeOv" aria-label="Tancar els daus" style="border:0;width:100%">
      <div style="display:flex;gap:24px">${d.map((v) => `<div class="die ${rolling ? 'roll' : 'land'}">${Array.from({ length: 9 }, (_, k) => `<span style="background:${pips[v]!.includes(k) ? '#151515' : 'transparent'}"></span>`).join('')}</div>`).join('')}</div>
      <div style="font-size:40px;font-weight:800">${rolling ? '…' : d[0] + d[1] + (d[0] === d[1] ? ' · dobles' : '')}</div>
      <div style="font-size:13px;color:var(--muted)">Tothom ho veu a dalt. Toca per tornar a la taula.</div></button>`;
  }

  private drawChat() {
    const log = this.st.chat
      .map((m) => `<div class="msg ${m.author === this.me ? 'me' : ''}">${m.author === this.me ? '' : `<b>${esc(userById(m.author).name)}</b> · `}${esc(m.text)}</div>`)
      .join('');
    this.chatSeen = this.st.chat.at(-1)?.id ?? '';
    const ov = this.$('#ov');
    const draft = ov.querySelector<HTMLInputElement>('#chatText')?.value ?? '';
    ov.innerHTML = `<div style="position:absolute;inset:0;z-index:690" data-a="closeOv"></div>
      <div class="cardbox" style="position:absolute;left:14px;right:14px;top:calc(128px + env(safe-area-inset-top,0px));z-index:700;padding:12px;gap:8px;animation:menu .25s cubic-bezier(.3,1.4,.5,1);transform-origin:top left">
      <div class="chatlog" id="chatLog">${log || '<span class="mode">Encara no hi ha missatges.</span>'}</div>
      <div class="chips">${['Bona tirada!', 'Paga!', 'Ui…', 'Ara torno'].map((t) => `<button data-a="say" data-v="${t}">${t}</button>`).join('')}</div>
      <form class="chatin" data-form="chat"><input id="chatText" maxlength="200" placeholder="Escriu un missatge" autocomplete="off"><button>Enviar</button></form></div>`;
    const input = ov.querySelector<HTMLInputElement>('#chatText')!;
    input.value = draft;
    const box = ov.querySelector<HTMLElement>('#chatLog')!;
    box.scrollTop = box.scrollHeight;
    this.drawTop();
  }

  // ---------- menú i panells ----------

  private drawMenu() {
    const st = this.st;
    const myTurn = currentPlayer(st) === this.me;
    const pend = this.pendingRequests().length;
    const item = (a: string, color: string, label: string, extra = '') => `<button role="menuitem" data-a="${a}"><span class="sw" style="background:${color}"></span>${label}${extra}</button>`;
    this.$('#menu').innerHTML = `<div style="position:absolute;inset:0;z-index:490" data-a="closeMenu"></div><div class="menu" role="menu" style="top:calc(128px + env(safe-area-inset-top,0px));max-height:calc(100% - 150px);overflow-y:auto">
      ${item('mBuy', '#E8672C', 'Comprar propietat')}
      ${item('mBuild', '#2F9A2F', 'Posar cases i hotels')}
      ${item('mPay', '#F2A65A', 'Pagar')}
      ${item('mChange', '#9CC8EE', 'Canviar bitllets')}
      ${item('mGo', '#A6D9A0', 'Cobrar la Sortida · 200€')}
      ${item('mBank', '#EFE3B0', 'Cobrar de la banca')}
      ${item('mAuction', '#F0CF2C', 'Subhasta')}
      ${item('mMortgage', '#5B3726', 'Hipotecar o vendre cases')}
      ${myTurn ? `<hr>${item('mEndTurn', '#151515', 'Passar el torn')}` : ''}
      ${this.isMaster ? `<hr><h4>MÀSTER</h4>${item('mRequests', '#D52B1E', 'Peticions pendents', pend ? ` <b style="margin-left:auto">${pend}</b>` : '')}${item('mEnd', '#888', 'Acabar la partida')}` : ''}
    </div>`;
  }

  private showPanel(panel: Panel) {
    this.closeAll();
    this.panel = panel;
    this.drawPay();
    this.drawInbox();
  }

  private picker(title: string, sub: string, opts: { label: string; sub?: string; color?: string; icon?: string; disabled?: boolean; pick: () => void }[], empty: string) {
    const on: Record<string, (v: string) => void> = {};
    opts.forEach((o, i) => (on['opt' + i] = o.pick));
    this.showPanel({
      on,
      html: () => `<div class="ph"><div><small>${esc(sub)}</small><b>${esc(title)}</b></div></div>
        <div class="opts">${
          opts.length
            ? opts.map((o, i) => `<button class="opt" data-a="opt${i}" ${o.disabled ? 'disabled' : ''}>${o.icon ?? `<span class="sw" style="background:${o.color ?? '#fff'}"></span>`}<span class="grow">${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')
            : `<p>${esc(empty)}</p>`
        }</div><button class="pill" data-a="panelClose">Tancar</button>`,
    });
  }

  private squareOpt(i: number) {
    const sq = getOwnable(i);
    return { color: sq.kind === 'street' ? GROUP[sq.group].band : '#fff', icon: sq.kind === 'street' ? undefined : `<span style="width:16px;display:flex;justify-content:center">${squareIcon(sq, 16)}</span>` };
  }

  private menuBuy() {
    const free = BOARD.filter((s) => isOwnable(s) && !this.st.deeds[s.index]) as OwnableSquare[];
    this.picker(
      'Comprar propietat',
      'ON HAS CAIGUT?',
      free.map((s) => ({
        label: s.name,
        sub: s.price + '€',
        ...this.squareOpt(s.index),
        pick: () =>
          this.openPay({
            title: `Comprar ${s.name}`,
            sub: this.isMaster ? 'PAGUES A LA BANCA' : 'HO HA D’ACCEPTAR EL MÀSTER',
            amount: s.price,
            to: BANK,
            onPay: (bills) => this.app.act({ type: 'request', kind: 'buy', square: s.index, bills }),
            done: this.isMaster ? undefined : 'Petició enviada al màster',
          }),
      })),
      'Ja estan totes comprades.',
    );
  }

  private buildOn(i: number) {
    const deed = this.st.deeds[i]!;
    const sq = getOwnable(i);
    this.openPay({
      title: `${deed.buildings === 4 ? 'Hotel' : 'Casa'} a ${sq.name}`,
      sub: this.isMaster ? 'PAGUES A LA BANCA' : 'HO HA D’ACCEPTAR EL MÀSTER',
      amount: buildCost(i),
      to: BANK,
      onPay: (bills) => this.app.act({ type: 'request', kind: 'build', square: i, bills }),
      done: this.isMaster ? undefined : 'Petició enviada al màster',
    });
  }

  private menuBuild() {
    const streets = this.myDeeds().filter((i) => getOwnable(i).kind === 'street').sort((a, b) => sortKey(a) - sortKey(b));
    this.picker(
      'Posar cases i hotels',
      'NOMÉS AMB TOT EL GRUP DE COLOR',
      streets.map((i) => {
        const d = this.st.deeds[i]!;
        const ok = canDo(() => assertCanBuild(this.st.deeds, i, this.me));
        return {
          label: getOwnable(i).name,
          sub: ok ? `${d.buildings === 4 ? 'hotel' : 'casa'} · ${buildCost(i)}€` : d.buildings === HOTEL ? 'té hotel' : `${d.buildings} cases`,
          ...this.squareOpt(i),
          disabled: !ok,
          pick: () => this.buildOn(i),
        };
      }),
      'Encara no tens carrers.',
    );
  }

  private unmortgage(i: number) {
    const sq = getOwnable(i);
    this.openPay({
      title: `Aixecar la hipoteca de ${sq.name}`,
      sub: this.isMaster ? 'PAGUES A LA BANCA' : 'HO HA D’ACCEPTAR EL MÀSTER',
      amount: unmortgageCost(sq),
      to: BANK,
      onPay: (bills) => this.app.act({ type: 'request', kind: 'unmortgage', square: i, bills }),
      done: this.isMaster ? undefined : 'Petició enviada al màster',
    });
  }

  private async simpleRequest(kind: 'sell-building' | 'mortgage', i: number) {
    const ok = await this.app.act({ type: 'request', kind, square: i });
    if (ok) {
      this.closeAll();
      this.redrawOverlays();
      if (!this.isMaster) this.toast('ok', 'Petició enviada al màster', '', 2600);
    }
  }

  private menuMortgage() {
    const opts: Parameters<TableScreen['picker']>[2] = [];
    this.myDeeds()
      .sort((a, b) => sortKey(a) - sortKey(b))
      .forEach((i) => {
        const sq = getOwnable(i);
        const d = this.st.deeds[i]!;
        if (d.mortgaged) opts.push({ label: `Aixecar hipoteca: ${sq.name}`, sub: unmortgageCost(sq) + '€', ...this.squareOpt(i), pick: () => this.unmortgage(i) });
        else if (canDo(() => assertCanSellBuilding(this.st.deeds, i, this.me)))
          opts.push({ label: `Vendre ${d.buildings === HOTEL ? "l'hotel" : 'una casa'}: ${sq.name}`, sub: '+' + buildCost(i) / 2 + '€', ...this.squareOpt(i), pick: () => this.simpleRequest('sell-building', i) });
        else if (canDo(() => assertCanMortgage(this.st.deeds, i, this.me)))
          opts.push({ label: `Hipotecar: ${sq.name}`, sub: '+' + sq.price / 2 + '€', ...this.squareOpt(i), pick: () => this.simpleRequest('mortgage', i) });
      });
    this.picker('Hipotecar o vendre cases', 'LA BANCA ET PAGA', opts, 'No tens res per hipotecar ni vendre.');
  }

  private menuPay() {
    let to: Party = this.others()[0] ?? BANK;
    let amount = '';
    let reason = 'Lloguer';
    const reasons = ['Lloguer', 'Impost', 'Carta', 'Presó', 'Altres'];
    const go = () => {
      const n = Number(amount);
      if (!Number.isInteger(n) || n <= 0) return this.toast('info', 'Escriu quant vols pagar', '', 2200);
      this.openPay({
        title: `Pagar ${fmt(n)}€ a ${nameOf(to)}`,
        sub: reason.toUpperCase(),
        amount: n,
        to,
        onPay: (bills) => this.app.act({ type: 'pay', to, amount: n, reason, bills }),
      });
    };
    this.showPanel({
      on: {
        payTarget: (v) => ((to = v), this.drawPay()),
        payReason: (v) => {
          reason = v;
          if (v === 'Impost' || v === 'Presó') to = BANK;
          this.drawPay();
        },
        payNext: () => {
          amount = this.$('#amount').querySelector('input')!.value;
          go();
        },
      },
      html: () => `<div class="ph"><div><small>PAGAR</small><b>A qui pagues?</b></div></div>
        <div class="chips">${[BANK, ...this.others()].map((p) => `<button data-a="payTarget" data-v="${p}" class="${to === p ? 'on' : ''}">${p === BANK ? 'Banca' : esc(userById(p).name)}</button>`).join('')}</div>
        <div class="chips">${reasons.map((r) => `<button data-a="payReason" data-v="${r}" class="${reason === r ? 'on' : ''}">${r}</button>`).join('')}</div>
        <label class="field" id="amount">Quant?<input type="number" inputmode="numeric" min="1" step="1" value="${amount}" placeholder="0"></label>
        <div class="row"><button class="pill" data-a="panelClose">Tancar</button><button class="pill red" data-a="payNext">Triar bitllets</button></div>`,
    });
    const input = this.$('#amount').querySelector('input')!;
    input.addEventListener('input', () => (amount = input.value));
  }

  private menuBank() {
    let amount = '';
    let reason = 'Carta de Sort';
    this.showPanel({
      on: {
        bankReason: (v) => ((reason = v), this.drawPay()),
        bankGo: async () => {
          amount = this.$('#amount').querySelector('input')!.value;
          const n = Number(amount);
          if (!Number.isInteger(n) || n <= 0) return this.toast('info', 'Escriu quant has de cobrar', '', 2200);
          const ok = await this.app.act({ type: 'request-bank-payment', amount: n, reason });
          if (ok) {
            this.closeAll();
            this.redrawOverlays();
            if (!this.isMaster) this.toast('ok', 'Petició enviada al màster', `${reason}: ${fmt(n)}€`, 3000);
          }
        },
      },
      html: () => `<div class="ph"><div><small>${this.isMaster ? 'LA BANCA ET PAGA' : 'HO HA D’ACCEPTAR EL MÀSTER'}</small><b>Cobrar de la banca</b></div></div>
        <div class="chips">${['Carta de Sort', 'Carta de Caixa', 'Altres'].map((r) => `<button data-a="bankReason" data-v="${r}" class="${reason === r ? 'on' : ''}">${r}</button>`).join('')}</div>
        <label class="field" id="amount">Quant?<input type="number" inputmode="numeric" min="1" step="1" value="${amount}" placeholder="0"></label>
        <div class="row"><button class="pill" data-a="panelClose">Tancar</button><button class="pill red" data-a="bankGo">Demanar</button></div>`,
    });
    const input = this.$('#amount').querySelector('input')!;
    input.addEventListener('input', () => (amount = input.value));
  }

  private menuAuction() {
    const free = BOARD.filter((s) => isOwnable(s) && !this.st.deeds[s.index]) as OwnableSquare[];
    this.picker(
      'Subhasta',
      'QUINA PROPIETAT ES SUBHASTA?',
      free.map((s) => ({
        label: s.name,
        sub: s.price + '€',
        ...this.squareOpt(s.index),
        pick: async () => {
          if (await this.app.act({ type: 'start-auction', square: s.index })) {
            this.closeAll();
            this.redrawOverlays();
          }
        },
      })),
      'No queda cap propietat per subhastar.',
    );
  }

  private menuRequests() {
    const list = () => this.pendingRequests();
    this.showPanel({
      on: {
        rYes: (id) => void this.app.act({ type: 'resolve-request', requestId: id, approve: true }),
        rNo: (id) => void this.app.act({ type: 'resolve-request', requestId: id, approve: false }),
      },
      html: () => `<div class="ph"><div><small>ETS EL MÀSTER</small><b>Peticions pendents</b></div></div>
        <div class="list">${
          list().length
            ? list()
                .map((r) => `<div class="li">${avatar(r.player)}<span class="grow">${esc(userById(r.player).name)}<br><small>${esc(describeRequest(r))}</small></span>
                  <button class="pill" style="height:36px;padding:0 10px" data-a="rNo" data-v="${r.id}">No</button><button class="pill red" style="height:36px;padding:0 10px" data-a="rYes" data-v="${r.id}">Sí</button></div>`)
                .join('')
            : '<p>No hi ha cap petició pendent.</p>'
        }</div><button class="pill" data-a="panelClose">Tancar</button>`,
    });
  }

  private moneyPanel() {
    this.showPanel({
      on: {},
      html: () => {
        const w = this.wallet;
        return `<div class="ph"><span class="av" style="background:#F2A65A;color:#151515">€</span><div><small>ELS TEUS DINERS</small><b>${fmt(walletTotal(w))}€</b></div></div>
        <div class="list">${VALS.map((v) => `<div class="li" style="min-height:40px"><span class="sw" style="width:34px;height:20px;border-radius:3px;border:1.5px solid var(--ink);background:${COL[v]}"></span><span class="grow">${w[v]} ${w[v] === 1 ? 'bitllet' : 'bitllets'} de ${v}€</span><b>${fmt(w[v] * v)}€</b></div>`).join('')}</div>
        ${this.loose.length ? `<p class="mode" style="text-align:left">${this.loose.length} d'aquests bitllets encara són a la taula: arrossega'ls al ventall.</p>` : ''}
        <button class="pill" data-a="panelClose">Tancar</button>`;
      },
    });
  }

  private profile() {
    const u = userById(this.me);
    this.showPanel({
      on: {
        switchUser: () => this.app.switchUser(),
      },
      html: () => `<div class="ph">${avatar(this.me)}<div><small>${this.isMaster ? 'MÀSTER DE LA PARTIDA' : 'JUGADOR'}</small><b>${esc(u.name)}</b></div></div>
        <p>Jugadors: ${this.st.turnOrder.map((p) => esc(userById(p).name)).join(', ')}.</p>
        ${this.app.store.online ? '' : '<p class="mode" style="text-align:left">Mode prova: la partida només es guarda en aquest mòbil.</p>'}
        <div class="row"><button class="pill" data-a="panelClose">Tancar</button><button class="pill" data-a="switchUser">Canviar d'usuari</button></div>`,
    });
  }

  // ---------- esdeveniments ----------

  private closeAll() {
    this.closeMenu();
    if (this.pay) this.pay = null;
    this.panel = null;
    this.focus = null;
    this.askPay = null;
    this.overlay = null;
  }

  private redrawOverlays() {
    this.drawPay();
    this.drawFocus();
    this.drawInbox();
    this.drawHand();
    if (!this.overlay && this.focus === null) this.$('#ov').innerHTML = '';
  }

  private closeMenu() {
    if (!this.menu) return;
    this.menu = false;
    this.$('#menu').innerHTML = '';
    this.$('#menuBtn').setAttribute('aria-expanded', 'false');
  }

  private overHand(D: { x: number; y: number }) {
    const cx = D.x + BW / 2;
    const cy = D.y + BH / 2;
    const P = this.pivot();
    if (cy < this.H - 170) return null;
    const a = (Math.atan2(cx - P.x, P.y - cy) * 180) / Math.PI;
    let best = 0;
    this.GA.forEach((f, i) => {
      if (Math.abs(f - a) < Math.abs(this.GA[best]! - a)) best = i;
    });
    return best;
  }

  private bind() {
    const pieces = this.$('#pieces');
    pieces.addEventListener('animationend', (e) => {
      const el = (e.target as HTMLElement).closest('.pc');
      if (el) el.classList.remove('thrown', 'nope');
    });
    pieces.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.pc');
      if (!el) return;
      e.preventDefault();
      this.closeMenu();
      let d: any;
      if (el.dataset.k === 'card') {
        const s = this.stacks.find((x) => x.id === el.dataset.s)!;
        const i = Number(el.dataset.i);
        d = {
          kind: 'card',
          s,
          i,
          els: Object.values(this.pcEls)
            .filter((x) => x.dataset.k === 'card' && x.dataset.s === s.id && Number(x.dataset.i) >= i)
            .sort((a, b) => Number(a.dataset.i) - Number(b.dataset.i)),
          x0: s.x,
          y0: s.y + i * DY_CARD,
        };
      } else {
        const b = this.loose.find((x) => x.id === el.dataset.b)!;
        d = { kind: 'bill', b, els: [el], x0: b.x, y0: b.y };
      }
      Object.assign(d, { sx: e.clientX, sy: e.clientY, moved: false });
      this.drag = d;
      pieces.setPointerCapture(e.pointerId);
    });
    pieces.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 6) return;
      if (!d.moved && this.open !== null) {
        this.open = null;
        this.drawHand();
      }
      d.moved = true;
      d.x = d.x0 + dx;
      d.y = d.y0 + dy;
      d.els.forEach((el: HTMLElement, j: number) => {
        el.classList.remove('thrown', 'nope');
        el.classList.add('lifted');
        el.style.left = d.x + 'px';
        el.style.top = d.y + j * DY_CARD + 'px';
      });
      if (d.kind === 'bill') {
        const g = this.overHand(d);
        if (g !== d.g) {
          d.g = g;
          this.drawHand(null, g === null ? null : d.b.v);
        }
      }
    });
    const endDrag = () => {
      const D = this.drag;
      if (!D) return;
      this.drag = null;
      if (D.kind === 'card') {
        const s: Stack = D.s;
        if (!D.moved) {
          this.closeAll();
          this.focus = s.items[D.i]!;
          this.flip = false;
          this.redrawOverlays();
          return;
        }
        const moving = s.items.slice(D.i);
        s.items = s.items.slice(0, D.i);
        this.stacks = this.stacks.filter((x) => x.items.length);
        const x = Math.max(6, Math.min(this.W - 90, D.x));
        const y = Math.max(124, Math.min(this.H - 310, D.y));
        let best: Stack | null = null;
        let bd = 50;
        this.stacks.forEach((t) => {
          const dist = Math.hypot(t.x - x, t.y + t.items.length * DY_CARD - y);
          if (dist < bd) {
            bd = dist;
            best = t;
          }
        });
        if (best) (best as Stack).items = (best as Stack).items.concat(moving);
        else this.stacks.push({ id: 'n' + ++this.seq, items: moving, x, y, rot: 0 });
        this.drawPieces();
        return;
      }
      const b: Loose = D.b;
      if (!D.moved) {
        this.collect(b);
        return;
      }
      const g = this.overHand(D);
      if (g !== null) {
        this.collect(b);
        return;
      }
      this.drawHand();
      b.x = Math.max(6, Math.min(this.W - BW - 6, D.x));
      b.y = Math.max(124, Math.min(this.H - 270, D.y));
      b.rot = 0;
      this.drawPieces();
    };
    pieces.addEventListener('pointerup', endDrag);
    pieces.addEventListener('pointercancel', endDrag);

    this.el.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = this.el.querySelector<HTMLInputElement>('#chatText');
      const text = input?.value.trim();
      if (!text) return;
      input!.value = '';
      void this.app.act({ type: 'chat', text });
    });

    this.el.addEventListener('click', (e) => void this.onClick(e));
  }

  /** Un bitllet de la taula torna al ventall. */
  private collect(b: Loose) {
    this.loose = this.loose.filter((x) => x !== b);
    this.drawPieces();
    this.drawHand(b.v);
    setTimeout(() => this.drawHand(), 450);
    if (!this.loose.length) this.toast('ok', 'Tot al ventall', `Ara tens ${fmt(walletTotal(this.wallet))}€.`, 2500);
  }

  private async onClick(e: Event) {
    const target = e.target as HTMLElement;
    const slot = target.closest<HTMLElement>('[data-slot]');
    if (slot) {
      this.closeMenu();
      const v = Number(slot.dataset.slot) as V;
      if (this.pay) return this.payGive(v);
      this.open = this.open === v ? null : v;
      this.drawHand();
      return;
    }
    const a = target.closest<HTMLElement>('[data-a]');
    if (!a) {
      if (this.open !== null) {
        this.open = null;
        this.drawHand();
      }
      return;
    }
    const act = a.dataset.a!;
    const v = a.dataset.v ?? '';
    if (this.panel?.on[act]) return this.panel.on[act]!(v);
    const st = this.st;
    switch (act) {
      case 'menu':
        if (this.menu) return this.closeMenu();
        this.menu = true;
        this.$('#menuBtn').setAttribute('aria-expanded', 'true');
        return this.drawMenu();
      case 'closeMenu':
        return this.closeMenu();
      case 'panelClose':
        this.panel = null;
        return this.redrawOverlays();
      case 'mBuy':
        return this.menuBuy();
      case 'mBuild':
        return this.menuBuild();
      case 'mPay':
        return this.menuPay();
      case 'mChange':
        return this.openPay({ title: 'Canviar bitllets', sub: 'AMB LA BANCA O AMB UN JUGADOR', amount: null, to: null, mode: 'change' });
      case 'mGo':
        this.closeMenu();
        return void this.app.act({ type: 'pass-go' });
      case 'mBank':
        return this.menuBank();
      case 'mAuction':
        return this.menuAuction();
      case 'mMortgage':
        return this.menuMortgage();
      case 'mEndTurn':
        this.closeMenu();
        return void this.app.act({ type: 'end-turn' });
      case 'mRequests':
        return this.menuRequests();
      case 'mEnd':
        this.closeMenu();
        if (confirm('Segur que vols acabar la partida per a tothom?')) void this.app.act({ type: 'end-game' });
        return;
      case 'turn':
        if (currentPlayer(st) === this.me && confirm('Vols passar el torn?')) void this.app.act({ type: 'end-turn' });
        return;
      case 'endTurn':
        this.closeMenu();
        if (await this.app.act({ type: 'end-turn' })) {
          const next = currentPlayer(this.st);
          this.toast('ok', 'Has acabat el torn', next ? `Ara és el torn de ${userById(next).name}.` : '', 3000);
        }
        return;
      case 'money':
        return this.moneyPanel();
      case 'profile':
        return this.profile();
      case 'sort':
        this.closeMenu();
        return this.sortCards();
      case 'roll': {
        this.closeAll();
        this.redrawOverlays();
        this.overlay = 'dice';
        this.rolling = true;
        const r = () => 1 + Math.floor(Math.random() * 6);
        const iv = setInterval(() => this.drawDice(true, [r(), r()]), 90);
        const final: [number, number] = [r(), r()];
        setTimeout(async () => {
          clearInterval(iv);
          this.rolling = false;
          this.drawDice(false, final);
          await this.app.act({ type: 'roll-dice', dice: final });
        }, 900);
        return;
      }
      case 'chat':
        this.closeAll();
        this.redrawOverlays();
        this.overlay = 'chat';
        return this.drawChat();
      case 'say':
        return void this.app.act({ type: 'chat', text: v });
      case 'closeOv':
        this.overlay = null;
        this.$('#ov').innerHTML = '';
        this.drawTop();
        return this.drawFocus();
      // pagar
      case 'payReq': {
        const r = st.paymentRequests.find((x) => x.id === v);
        if (!r) return;
        const what = r.auction ? `SUBHASTA DE ${getOwnable(r.square!).name}` : r.square !== undefined ? `LLOGUER DE ${getOwnable(r.square).name}` : 'PAGA SOL·LICITADA';
        return this.openPay({
          title: `Pagar ${fmt(r.amount)}€ a ${nameOf(r.creditor)}`,
          sub: what.toUpperCase(),
          amount: r.amount,
          to: r.creditor,
          onPay: (bills) => this.app.act({ type: 'pay-request', requestId: r.id, bills }),
        });
      }
      case 'payMode':
        this.pay!.mode = v as 'pay' | 'change';
        this.pay!.last = '';
        return this.drawPay();
      case 'payWho':
        if (this.pay!.waitOffer) return;
        this.pay!.who = v;
        this.pay!.last = '';
        return this.drawPay();
      case 'payDir':
        this.pay!.dir = v as 'down' | 'up';
        this.pay!.last = '';
        return this.drawPay();
      case 'unGive': {
        const b = this.pay!.given.splice(Number(v), 1)[0]!;
        this.drawHand(b);
        setTimeout(() => this.drawHand(), 450);
        return this.drawPay();
      }
      case 'payCancel':
        if (this.pay?.waitOffer) void this.app.act({ type: 'cancel-exchange', offerId: this.pay.waitOffer });
        this.pay = null;
        return this.redrawOverlays();
      case 'payGo': {
        const p = this.pay!;
        const ok = await p.onPay!(count(p.given));
        if (!ok) return;
        this.pay = null;
        this.redrawOverlays();
        this.toast('ok', p.done ?? `Has pagat ${fmt(p.amount!)}€`, p.done ? 'Quan l\u2019accepti, es pagarà amb els bitllets que has triat.' : 'Just, sense canvi.', 3000);
        return;
      }
      case 'offerYes':
      case 'offerNo':
        return void this.app.act({ type: 'respond-exchange', offerId: v, accept: act === 'offerYes' });
      case 'reqYes':
      case 'reqNo':
        return void this.app.act({ type: 'resolve-request', requestId: v, approve: act === 'reqYes' });
      // cartes
      case 'flip': {
        this.flip = !this.flip;
        const deed = this.focus !== null ? st.deeds[this.focus] : undefined;
        const f = this.el.querySelector('.flipper');
        f?.classList.toggle('flip', this.flip !== !!deed?.mortgaged);
        return;
      }
      case 'closeFocus':
        this.focus = null;
        this.askPay = null;
        return this.redrawOverlays();
      case 'askPay': {
        const sq = getOwnable(this.focus!);
        this.diceFor = null;
        this.askPay = sq.kind === 'utility' && this.dice() === undefined ? 'dice' : 'pick';
        return this.drawFocus();
      }
      case 'diceFor':
        this.diceFor = Number(v);
        this.askPay = 'pick';
        return this.drawFocus();
      case 'askBack':
        this.askPay = null;
        return this.drawFocus();
      case 'payTo': {
        const i = this.focus!;
        const ok = await this.app.act({ type: 'request-payment', debtor: v, square: i, ...(this.diceFor ? { diceTotal: this.diceFor } : {}) });
        if (!ok) return;
        const amount = st.paymentRequests.length ? this.st.paymentRequests.at(-1)!.amount : 0;
        this.focus = null;
        this.askPay = null;
        this.redrawOverlays();
        this.toast('ok', `Sol·licitud enviada a ${userById(v).name}`, `Li surt un avís per pagar-te ${fmt(amount)}€ just.`, 3500);
        return;
      }
      case 'cardBuild': {
        const i = this.focus!;
        this.focus = null;
        return this.buildOn(i);
      }
      case 'cardSell':
        return this.simpleRequest('sell-building', this.focus!);
      case 'cardMortgage':
        return this.simpleRequest('mortgage', this.focus!);
      case 'cardUnmortgage': {
        const i = this.focus!;
        this.focus = null;
        return this.unmortgage(i);
      }
      // subhasta
      case 'bid':
        return void this.app.act({ type: 'bid', amount: Number(v) });
      case 'closeAuction':
        return void this.app.act({ type: 'close-auction' });
    }
  }
}

/** Fa vibrar el mòbil si ho permet (a l'iPhone no fa res). */
function buzz(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Sense vibració.
  }
}

function expand(w: Wallet): V[] {
  return VALS.flatMap((v) => Array<V>(w[v]).fill(v));
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function canDo(fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

export function describeRequest(r: MasterRequest): string {
  const name = r.square !== undefined ? getOwnable(r.square).name : '';
  switch (r.kind) {
    case 'buy':
      return `Comprar ${name}`;
    case 'build':
      return `Posar una casa a ${name}`;
    case 'sell-building':
      return `Vendre una casa de ${name}`;
    case 'mortgage':
      return `Hipotecar ${name}`;
    case 'unmortgage':
      return `Aixecar la hipoteca de ${name}`;
    case 'bank-payment':
      return `Cobrar ${fmt(r.amount ?? 0)}€ de la banca (${r.reason ?? ''})`;
  }
}

