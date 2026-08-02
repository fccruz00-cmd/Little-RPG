# Little RPG

Idle auto-battler de navegador, feito pra celular em pé. O herói anda sozinho
em linha reta, encontra os bichos, mata sozinho e avança de fase — você só
decide onde gastar o ouro.

O layout segue as três faixas do rascunho: **UI** no topo, **Fight** no meio e
o painel embaixo, agora com três abas: **Upgrades**, **Talentos** e
**Prestígio**.

```
┌──────────────────────────────┐
│ ◀  Fase 7   ▶      ouro / dps│  UI
├──────────────────────────────┤
│      🗡️ ————→  👹            │  Fight
│  chão rolando, parallax      │
├──────────────────────────────┤
│ Upgrades │ Talentos │Prestígio│  abas
│  Dano            Nv. 12  221 │
│  Vel. de Ataque  Nv.  6  181 │
└──────────────────────────────┘
```

## Rodando

**Do jeito mais rápido:** baixe `little-rpg.html` e abra com dois cliques. É o
jogo inteiro num arquivo só (373 KB) — CSS, código e sprites embutidos, sem
servidor e sem pasta ao lado. Até o progresso salvo funciona.

**Pra mexer no código:** sirva a pasta, porque o jogo usa módulos ES e o
`index.html` não abre direto pelo `file://`.

```sh
python3 -m http.server 8000
# abre http://localhost:8000
```

Depois de mudar qualquer coisa, regere o arquivo único:

```sh
python3 tools/build_single_file.py
```

## Como funciona

- **Fases** — 10 mobs e um **encontro final**: mini-chefe nas fases comuns,
  **chefe** de 5 em 5. Os dois entram em cena maiores que os mobs; o chefe
  ainda tem 30 s de prazo, e perder o prazo ou morrer pra ele devolve a vida
  cheia dele. Contra mob e mini-chefe, morrer só custa o tempo de levantar.
- **Combate** — o herói caminha até o alcance do inimigo, para e bate no ritmo
  da Vel. de Ataque. O inimigo faz o mesmo. Morreu, ele levanta em 2 s.
- **Ouro** — cai de cada abate e cresce junto com a fase. Mini-chefe paga 5×,
  chefe paga 14×.
- **Ocioso** — com o jogo fechado (ou a aba escondida) você acumula metade do
  seu ouro/segundo, até 8 h.
- **◀ ▶** — dá pra voltar pra uma fase já vencida e farmar ouro nela.
- O progresso salva sozinho no `localStorage` a cada 5 s.

### As três abas

1. **Upgrades** — atributos comprados com **ouro**, que zeram no renascimento.
2. **Talentos** — duas árvores no mesmo lugar, no seletor do topo:
   - *Talentos*, pagos com **pontos de nível** (1 por nível). Zeram no
     renascimento; dá pra redistribuir a qualquer momento.
   - *Relíquias*, a árvore de prestígio, paga com **relíquias**. É permanente.
   - Nos dois casos um nó só abre quando o anterior do galho tem 1 ponto.
3. **Prestígio** — renascer. Zera fase, ouro, upgrades, nível e talentos, e
   converte a profundidade da corrida em relíquias. A primeira sai na fase 25;
   como o cálculo é acumulado menos o que já foi recebido, repetir a mesma
   profundidade não paga de novo.

### Nível e experiência

Cada abate dá XP (mini-chefe ×5, chefe ×12) e cada nível dá 1 ponto de talento.
O nível não mexe em atributo nenhum sozinho — quem dá poder é a árvore, senão
seria mais uma curva escondida. A árvore inteira custa 80 pontos e enche por
volta da fase 120; o talento *Veterano*, na árvore de relíquias, adiciona
pontos extras que sobrevivem ao renascimento.

## Organização

```
index.html          três faixas do layout
styles.css          UI (botões e molduras são 9-slice do pacote Mini Medieval)
src/
  main.js           bootstrap + game loop (passo fixo de 1/60 s)
  format.js         1.2K, 340M, 5.07aa…
  data/
    balance.js      TODAS as curvas numéricas — é o arquivo pra rebalancear
    enemies.js      elenco, quando cada bicho aparece, chefes
    upgrades.js     o que aparece na loja
    levels.js       curva de XP e ganho por abate
    talents.js      as duas árvores (nós, efeitos e custos)
    prestige.js     quantas relíquias uma corrida vale
    sprites.js      GERADO — contagem de frames e caixa de cada sprite
  engine/
    loader.js       carregamento das imagens
    anim.js         tocador de spritesheet
  game/
    state.js        atributos derivados, árvores, nível, prestígio, save/load
    battle.js       simulação da arena (não conhece canvas nem DOM)
    render.js       canvas: cenário procedural, sprites, barras, números
  ui/ui.js          HUD, abas, loja, árvores e painel de prestígio
little-rpg.html     GERADO — o jogo inteiro num arquivo só
tools/
  extract_assets.py    recorta os pacotes originais pro que o jogo usa
  build_single_file.py empacota tudo no little-rpg.html
```

`battle.js` só emite eventos (`stage`, `spawn`, `hit`, `kill`, `toast`); quem
desenha e quem mexe no DOM são o `render.js` e a `ui.js`. Dá pra trocar a
renderização inteira sem encostar na simulação.

Os nós das árvores não conhecem os atributos: cada um só acumula numa chave de
bônus (`dmgMul`, `goldMul`, `critAdd`…), e o `GameState` aplica essas chaves em
cima do que foi comprado com ouro. Pra criar um talento novo basta uma linha em
`talents.js` — se a chave já existir, não precisa mexer em mais nada.

### Rebalancear

Tudo que é número de progressão está em `src/data/balance.js`. A curva atual
mira nisto — o mini-chefe fica em torno de 4× um mob e o chefe em 10×:

| fase | mob | mini-chefe | chefe |
|-----:|----:|-----------:|------:|
|   10 | 1,9 s | 7,2 s | 18,8 s |
|   20 | 2,3 s | 9,1 s | 22,7 s |
|   60 | 0,4 s | 1,5 s |  3,7 s |
|  120 | 0,7 s | 3,4 s |  7,4 s |

A folga do meio é de propósito: é quando os atributos com teto (crítico, vel.
de ataque, ouro) enchem e você atropela um trecho antes da curva apertar de
novo. Só **Dano**, **Vida Máxima** e **Regeneração** crescem sem teto — se o
ganho de ouro também crescesse, ele se realimentava e o jogo virava trivial por
volta da fase 25.

O período de ataque dos mobs (1,25 s) é menor que o tempo que eles levam pra
morrer, de propósito: se o mob nunca chega a encaixar um golpe ele vira boneco
de pancada e a luta não tem tensão nenhuma. Pela simulação isso dá umas 30
mortes até a fase 20, quase todas no mini-chefe, e aí você passa a aguentar.

### Trocar os sprites

`tools/extract_assets.py` recorta os pacotes originais e regrava
`assets/manifest.json`:

```sh
python3 tools/extract_assets.py \
  "<pacote de personagens>/Characters(100x100 split)" \
  "<Mini-Medieval-User-Interface-8x8>" \
  "<Raven Fantasy Icons>/Full Spritesheet/32x32.png"
```

Depois é só regerar `src/data/sprites.js` a partir do manifesto. O elenco fica
no dicionário `ROSTER` e os ícones na lista `ICONS`, ambos no topo do script.

## Créditos dos assets

O jogo usa recortes de três pacotes de terceiros:

- **Tiny RPG Character Asset Pack 01** — personagens e animações
- **Mini Medieval User Interface v1.1** — [VEXED](https://v3x3d.itch.io/) — botões e molduras
- **Premium — Raven Fantasy Icons** — ícones dos upgrades

Nenhum dos três traz arquivo de licença junto. O de ícones em particular é
vendido como pacote pago, e licenças desse tipo costumam liberar o uso em jogos
mas **proibir redistribuir a arte crua** — o que é exatamente o que acontece ao
versionar `assets/` num repositório público. Se for publicar, confira os termos
de cada pacote; se não puderem ir junto, é só colocar `assets/characters/`,
`assets/ui/` e `assets/icons/` no `.gitignore` e cada pessoa roda o
`tools/extract_assets.py` com os pacotes originais.
