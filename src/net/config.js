// The leaderboard backend. BOTH values are public by design -- the anon key
// is made to ship in clients and the real security lives in the database's
// row level security (see supabase/schema.sql). The database PASSWORD, on
// the other hand, must never appear anywhere near this repository.
//
// Empty strings mean NO backend: the trophy button never shows, the game
// makes zero network calls, and everything else works exactly as before.
// Fill both in (Supabase dashboard -> Settings -> API) to light it up.
export const LEADERBOARD = {
  url: 'https://pnfnkvgztatcdjgkdjnf.supabase.co',
  anon: 'sb_publishable_PuN8RjQKDGp9S_PkGU2NDA_1KpStOZk',
};
