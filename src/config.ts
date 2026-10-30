// Connexió a Supabase perquè tots els mòbils vegin la mateixa partida.
// La clau «anon» és pública per disseny: es pot posar aquí sense problema.
// Si es deixen buides, l'app funciona en mode prova, només en aquest dispositiu.

export const SUPABASE_URL = 'https://mjdbqbcyensvyvhzegrc.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qZGJxYmN5ZW5zdnl2aHplZ3JjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MTcyNzEsImV4cCI6MjEwNTQ5MzI3MX0.6y2fN-z7voI1K_43oKvpnZd4804egLKhDQDdrccRGy4';
