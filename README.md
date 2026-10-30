# Tarrojapoly

El Monopoly de Tarroja de Segarra com a web (PWA) per jugar des del mòbil, iPhone o Android, amb diners ficticis. Ús privat, no comercial.

## Com es juga

1. Obre la web i tria qui ets de la llista de veïns. El mòbil se'n recorda.
2. Si no hi ha cap partida, qui la crea és el **màster**: tria entre 2 i 8 jugadors (ell inclòs).
3. Els jugadors triats entren, veuen la sala d'espera i premen **Unir-me**. El màster veu qui hi ha entrat, tria l'ordre de torn i comença.
4. A la taula tens les teves cartes al mig i els bitllets en ventall a baix. Des del menú pots comprar, posar cases, pagar, canviar bitllets, cobrar la Sortida, subhastar i hipotecar.
5. Compres, cases, hipoteques i cobraments de la banca els accepta el màster. Els pagaments entre jugadors no: el propietari toca la carta, prem **Sol·licitar paga** i tria qui ha caigut.
6. Només es paga just. Si no tens l'import exacte, demana canvi a la banca o a un altre jugador, cap a bitllets més petits o més grans. La banca té 30 bitllets de cada.

Per instal·lar-la com una app: a l'iPhone, Safari → Compartir → «Afegir a la pantalla d'inici»; a Android, Chrome → menú → «Instal·lar l'aplicació».

## Codi

- `src/data/board.ts`: les 40 caselles del Tarrojapoly. Els lloguers són els del Monopoly clàssic fins que les cartes tinguin valors.
- `src/data/users.ts`: la llista de veïns.
- `src/engine/`: les regles i la partida (bitllets, lloguers, cases, màster, subhastes, canvis). Funcions pures amb proves.
- `src/net/store.ts`: on es guarda la partida. Amb Supabase, tots els mòbils la comparteixen en temps real; sense, funciona en mode prova en un sol mòbil.
- `src/ui/`: les pantalles (triar usuari, sala d'espera i la taula).
- `public/maqueta.html`: la maqueta de disseny original.

```bash
npm install
npm run dev     # per provar-la a l'ordinador
npm test
npm run build
```

## Publicació

Cada canvi a `main` es publica sol a GitHub Pages amb l'acció `.github/workflows/pages.yml`. A Settings → Pages, l'origen ha de ser «GitHub Actions».

## Supabase (perquè els mòbils juguin junts)

1. Crea un projecte gratuït a supabase.com.
2. Al projecte, obre **SQL Editor**, enganxa el contingut de `supabase/schema.sql` i executa'l.
3. A **Project Settings → API**, copia la **Project URL** i la clau **anon public**, i posa-les a `src/config.ts`.
