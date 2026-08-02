// Elenco de inimigos. `from` é a fase em que o bicho começa a aparecer;
// `hp`/`dmg` são multiplicadores em cima da curva base da fase.

export const MOBS = [
  { id: 'slime',               name: 'Gosma',              from: 1,  hp: 0.75, dmg: 0.70, speed: 15, reach: 15, hit: 0.55 },
  { id: 'bat',                 name: 'Morcego',            from: 1,  hp: 0.55, dmg: 0.85, speed: 34, reach: 14, hit: 0.50, hover: 5 },
  { id: 'orc',                 name: 'Orc',                from: 3,  hp: 1.00, dmg: 1.00, speed: 20, reach: 17, hit: 0.55 },
  { id: 'skeleton',            name: 'Esqueleto',          from: 6,  hp: 0.90, dmg: 1.15, speed: 24, reach: 18, hit: 0.55 },
  { id: 'armored_skeleton',    name: 'Esqueleto Blindado', from: 11, hp: 1.45, dmg: 1.10, speed: 18, reach: 18, hit: 0.60 },
  { id: 'armored_orc',         name: 'Orc Blindado',       from: 16, hp: 1.70, dmg: 1.25, speed: 17, reach: 18, hit: 0.60 },
  { id: 'werewolf',            name: 'Lobisomem',          from: 22, hp: 1.30, dmg: 1.60, speed: 32, reach: 19, hit: 0.50 },
  { id: 'greatsword_skeleton', name: 'Ceifador',           from: 30, hp: 1.80, dmg: 1.45, speed: 19, reach: 22, hit: 0.60 },
  { id: 'elite_orc',           name: 'Orc de Elite',       from: 40, hp: 2.10, dmg: 1.60, speed: 20, reach: 20, hit: 0.60 },
  { id: 'werebear',            name: 'Urso Ancião',        from: 52, hp: 2.60, dmg: 1.85, speed: 18, reach: 20, hit: 0.60 },
];

// Chefes: entram de 5 em 5 fases, em rodízio.
export const BOSSES = [
  { id: 'orc_rider',      name: 'Montador de Orcs', hp: 1.00, dmg: 1.6, speed: 16, reach: 22, hit: 0.60 },
  { id: 'knight_templar', name: 'Templário',        hp: 1.15, dmg: 1.5, speed: 15, reach: 21, hit: 0.55 },
  { id: 'swordsman',      name: 'Espadachim',       hp: 1.05, dmg: 1.7, speed: 20, reach: 20, hit: 0.55 },
  { id: 'necromancer',    name: 'Necromante',       hp: 1.25, dmg: 1.8, speed: 13, reach: 24, hit: 0.65 },
  { id: 'wizard',         name: 'Arquimago',        hp: 1.35, dmg: 2.0, speed: 14, reach: 24, hit: 0.60 },
];

// O Soldier do pacote é o único personagem que vem com uma sombra pintada
// no sprite, mesmo na pasta "sem sombras" — e ela brigava com a sombra que o
// jogo desenha. Trocar de boneco resolve; o Knight vem limpo.
export const HERO = {
  id: 'knight',
  reach: 19,   // distância (px do mundo) em que o herói para pra bater
  hit: 0.5,    // fração da animação de ataque em que o golpe acerta
};

export const BOSS_EVERY = 5;      // 1 chefe a cada N fases
export const KILLS_PER_STAGE = 10; // mobs comuns antes do encontro final

/** Pool de inimigos comuns disponível numa fase (os 4 mais recentes). */
export function mobsForStage(stage) {
  const unlocked = MOBS.filter((m) => m.from <= stage);
  return unlocked.slice(-4);
}

/**
 * Mini-chefe que fecha uma fase comum: o bicho mais encorpado já liberado,
 * numa versão graúda. A lista não é estritamente crescente (o morcego é
 * frágil de propósito), então escolhe pelo multiplicador de vida em vez de
 * pegar o último — senão a fase 1 acabaria num mini-chefe morcego.
 */
export function eliteForStage(stage) {
  return MOBS.filter((m) => m.from <= stage)
    .reduce((best, m) => (m.hp >= best.hp ? m : best));
}

export function isBossStage(stage) {
  return stage % BOSS_EVERY === 0;
}

export function bossForStage(stage) {
  return BOSSES[(Math.floor(stage / BOSS_EVERY) - 1) % BOSSES.length];
}

/** Todos os sprites que o jogo pode precisar carregar. */
export function allActorIds() {
  return [HERO.id, ...MOBS.map((m) => m.id), ...BOSSES.map((b) => b.id)];
}
