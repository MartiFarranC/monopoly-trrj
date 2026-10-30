// Veïns que poden jugar. Cada un té un color per a la seva rodona de perfil.

export interface User {
  id: string;
  name: string;
  color: string;
}

const NAMES = [
  'Martí', 'Sara', 'Joan', 'Ricard', 'Arnau Mas', 'Eric', 'Dàlia', 'Julia Ros', 'Julia Torras',
  'Aldan', 'Joel', 'Eilika', 'Marc', 'Noemi', 'Mar', 'Marinha', 'Aina', 'Arnau Pastor', 'Bruna',
  'Jordi', 'Sergi', 'Albert Ortega', 'Albert Tarruella', 'Ainara', 'Aurea', 'Ramoncin',
];

const COLORS = ['#E8505B', '#4A90D9', '#3FB37F', '#E8672C', '#9B59B6', '#D4A017', '#16A3A3', '#C0392B', '#2E7D32', '#5C6BC0'];

const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

export const USERS: readonly User[] = NAMES.map((name, i) => ({ id: slug(name), name, color: COLORS[i % COLORS.length]! }));

export function userById(id: string): User {
  return USERS.find((u) => u.id === id) ?? { id, name: id, color: '#888' };
}

/** Inicials per a la rodona: «Arnau Mas» → «AM», «Martí» → «M». */
export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
