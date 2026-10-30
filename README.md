# Monopoly de Tarroja de Segarra

PWA per jugar al Monopoly de Tarroja amb els del poble des del mòbil (iPhone i Android), amb diners ficticis. Ús privat, no comercial.

## Estat

Ara hi ha la lògica del joc, sense pantalles (l'estètica s'està tancant a part):

- `src/data/board.ts`: les 40 caselles del Tarrojapoly. Els lloguers encara són els del Monopoly clàssic fins que les cartes tinguin valors.
- `src/engine/bills.ts`: carteres de bitllets (500, 100, 50, 20, 10, 5, 1). En pagar, l'app tria els bitllets. Si qui paga no té l'import just, canvia bitllets amb la banca i qui cobra rep sempre l'import exacte: qui cobra no torna mai canvi.
- `src/engine/rules.ts`: lloguers (grup complet, cases, hotel, estacions, serveis), construcció uniforme, límit de 32 cases i 12 hotels, hipoteques.
- `src/engine/game.ts`: la partida. El màster crea la partida i tria de 2 a 8 jugadors, ells s'uneixen, el màster fixa l'ordre de torn. Compres, cases, vendes i hipoteques són peticions que el màster accepta o rebutja (les seves s'apliquen soles, perquè també juga). Els pagaments entre jugadors no passen pel màster: el propietari fa «sol·licitar paga» des de la carta i el deutor prem «Pagar». També hi ha subhastes, pas per la Sortida i pagaments a la banca.
- `supabase/schema.sql`: taules, permisos i temps real per a Supabase.

## Com provar-ho

```bash
npm install
npm test
npm run typecheck
```

## Arquitectura

L'estat de cada partida és un JSON que només canvia aplicant accions amb `applyAction(estat, qui, acció)`. El servidor (una funció de Supabase) validarà cada acció amb aquest mateix motor i guardarà el nou estat a `games.state`; els mòbils l'escolten en temps real.
