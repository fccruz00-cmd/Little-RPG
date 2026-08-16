// The mobile shell is deliberately a presenter, not a second game client.
// It forwards every action to the existing UI controls and never imports game
// balance, state or battle code. Browser and mobile therefore share the same
// purchases, resets, automation, audio, billing, save and renderer behavior.

if (document.documentElement.dataset.ui === 'mobile') {
  const COPY = {
    en: {
      nav: { battle: 'Battle', grow: 'Grow', craft: 'Trades', legacy: 'Legacy', more: 'More' },
      tabs: {
        upgrades: 'Upgrades', talents: 'Talents', skills: 'Skills', forge: 'Forge',
        pets: 'Pets', prestige: 'Ascend', hall: 'Ancestors', awaken: 'Awaken',
        cosmos: 'Singularity',
      },
      moreTitle: 'Game menu',
      more: {
        contracts: ['Contracts', 'Daily and weekly goals'],
        bestiary: ['Bestiary and jewels', 'Awakening discoveries'],
        ranks: ['Leaderboards', 'Weekly sprint and best stage'],
        store: ['Store', 'Gem packs and purchase status'],
        options: ['Options', 'Sound, language and save tools'],
      },
      label: 'Mobile navigation',
      sectionLabel: 'Section navigation',
    },
    pt: {
      nav: { battle: 'Batalha', grow: 'Evoluir', craft: 'Ofícios', legacy: 'Legado', more: 'Mais' },
      tabs: {
        upgrades: 'Melhorias', talents: 'Talentos', skills: 'Ofícios', forge: 'Forja',
        pets: 'Pets', prestige: 'Ascender', hall: 'Ancestrais', awaken: 'Despertar',
        cosmos: 'Singularidade',
      },
      moreTitle: 'Menu do jogo',
      more: {
        contracts: ['Contratos', 'Metas diárias e semanais'],
        bestiary: ['Bestiário e joias', 'Descobertas do despertar'],
        ranks: ['Placares', 'Corrida semanal e melhor fase'],
        store: ['Loja', 'Pacotes de gemas e compras'],
        options: ['Opções', 'Som, idioma e salvamento'],
      },
      label: 'Navegação mobile',
      sectionLabel: 'Navegação da seção',
    },
  };

  const GROUPS = {
    battle: { icon: 'damage', tabs: ['upgrades'], initial: 'upgrades' },
    grow: { icon: 'book', tabs: ['upgrades', 'talents'], initial: 'talents' },
    craft: { icon: 'pick', tabs: ['skills', 'forge', 'pets'], initial: 'skills' },
    legacy: { icon: 'relic', tabs: ['prestige', 'hall', 'awaken', 'cosmos'], initial: 'prestige' },
    more: { icon: 'gear', tabs: [], initial: null },
  };

  const MORE_ACTIONS = [
    { id: 'contracts', icon: 'gem' },
    { id: 'bestiary', icon: 'book', sourceTab: 'awaken' },
    { id: 'ranks', icon: 'crown', sourceButton: 'btn-ranks' },
    { id: 'store', icon: 'shop', sourceButton: 'btn-store' },
    { id: 'options', icon: 'gear', sourceButton: 'btn-options' },
  ];

  const onReady = ({ state }) => {
    const app = document.getElementById('app');
    const panel = app?.querySelector('.panel');
    const legacyTabs = document.getElementById('tabs');
    if (!app || !panel || !legacyTabs || app.dataset.mobileReady === 'true') return;
    app.dataset.mobileReady = 'true';

    const copy = COPY[state.lang === 'pt' ? 'pt' : 'en'];
    document.documentElement.lang = state.lang === 'pt' ? 'pt-BR' : 'en';

    const tabButton = (name) => legacyTabs.querySelector(`.tab[data-tab="${name}"]`);
    const tabIsAvailable = (name) => {
      const button = tabButton(name);
      return Boolean(button && !button.hidden);
    };

    const subnav = document.createElement('nav');
    subnav.className = 'mobile-subnav';
    subnav.setAttribute('aria-label', copy.sectionLabel);
    panel.prepend(subnav);

    const morePane = document.createElement('div');
    morePane.className = 'pane mobile-more';
    morePane.id = 'pane-mobile-more';
    morePane.innerHTML = `
      <h2 class="mobile-more__title">${copy.moreTitle}</h2>
      <div class="mobile-more__list"></div>`;
    panel.insertBefore(morePane, panel.querySelector('.foot'));

    const moreList = morePane.querySelector('.mobile-more__list');
    const moreRows = new Map();
    for (const action of MORE_ACTIONS) {
      const [title, note] = copy.more[action.id];
      const button = document.createElement('button');
      button.className = 'mobile-action';
      button.type = 'button';
      button.dataset.action = action.id;
      button.innerHTML = `
        <i class="ico ico--lg ico--${action.icon}" aria-hidden="true"></i>
        <span class="mobile-action__copy"><strong>${title}</strong><small>${note}</small></span>
        <span class="mobile-action__arrow" aria-hidden="true">›</span>`;
      moreList.append(button);
      moreRows.set(action.id, { action, button });
    }

    const nav = document.createElement('nav');
    nav.className = 'mobile-nav';
    nav.setAttribute('aria-label', copy.label);
    const navButtons = new Map();
    for (const [name, group] of Object.entries(GROUPS)) {
      const button = document.createElement('button');
      button.className = 'mobile-nav__button';
      button.type = 'button';
      button.dataset.mobileSection = name;
      button.innerHTML = `
        <i class="ico ico--lg ico--${group.icon}" aria-hidden="true"></i>
        <span>${copy.nav[name]}</span>
        <i class="mobile-nav__pip" hidden aria-hidden="true"></i>`;
      nav.append(button);
      navButtons.set(name, button);
    }
    app.append(nav);

    let currentSection = 'battle';
    const lastTab = Object.fromEntries(
      Object.entries(GROUPS).map(([name, group]) => [name, group.initial]),
    );

    const activeLegacyTab = () => legacyTabs.querySelector('.tab.is-on')?.dataset.tab ?? null;

    const updatePips = () => {
      for (const [section, button] of navButtons) {
        const pip = button.querySelector('.mobile-nav__pip');
        const hasAttention = GROUPS[section].tabs.some((name) => {
          const source = tabButton(name)?.querySelector('.pip');
          return source && !source.hidden && tabIsAvailable(name);
        });
        pip.hidden = !hasAttention;
      }

      for (const button of subnav.querySelectorAll('.mobile-subnav__button')) {
        const source = tabButton(button.dataset.tab)?.querySelector('.pip');
        button.querySelector('.mobile-subnav__pip').hidden = !source || source.hidden;
      }
    };

    const updateMoreAvailability = () => {
      for (const { action, button } of moreRows.values()) {
        if (action.sourceTab) button.hidden = !tabIsAvailable(action.sourceTab);
        else if (action.sourceButton) {
          const source = document.getElementById(action.sourceButton);
          button.hidden = !source || source.hidden;
        }
      }
    };

    const updateNavAvailability = () => {
      for (const [name, button] of navButtons) {
        if (name === 'more') continue;
        button.disabled = !GROUPS[name].tabs.some(tabIsAvailable);
      }
    };

    const setNavState = () => {
      app.dataset.mobileSection = currentSection;
      for (const [name, button] of navButtons) {
        const on = name === currentSection;
        button.classList.toggle('is-on', on);
        if (on) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
    };

    const setSubnavState = () => {
      const currentTab = activeLegacyTab();
      for (const button of subnav.querySelectorAll('.mobile-subnav__button')) {
        const on = button.dataset.tab === currentTab;
        button.classList.toggle('is-on', on);
        button.setAttribute('aria-selected', String(on));
      }
      updatePips();
    };

    const renderSubnav = () => {
      subnav.replaceChildren();
      if (currentSection === 'more') {
        subnav.hidden = true;
        return;
      }

      const available = GROUPS[currentSection].tabs.filter(tabIsAvailable);
      subnav.hidden = available.length <= 1;
      for (const name of available) {
        const button = document.createElement('button');
        button.className = 'mobile-subnav__button';
        button.type = 'button';
        button.dataset.tab = name;
        button.setAttribute('role', 'tab');
        button.innerHTML = `${copy.tabs[name]}<i class="mobile-subnav__pip" hidden aria-hidden="true"></i>`;
        subnav.append(button);
      }
      setSubnavState();
    };

    const activateLegacyTab = (name) => {
      const source = tabButton(name);
      if (!source || source.hidden) return false;
      morePane.classList.remove('is-on');
      source.click();
      lastTab[currentSection] = name;
      setSubnavState();
      return true;
    };

    const showSection = (name) => {
      if (name !== 'more' && !GROUPS[name].tabs.some(tabIsAvailable)) return;
      currentSection = name;
      setNavState();

      if (name === 'more') {
        for (const pane of panel.querySelectorAll('.pane')) pane.classList.remove('is-on');
        morePane.classList.add('is-on');
        renderSubnav();
        updateMoreAvailability();
        return;
      }

      renderSubnav();
      const available = GROUPS[name].tabs.filter(tabIsAvailable);
      const preferred = available.includes(lastTab[name]) ? lastTab[name] : available[0];
      if (preferred) activateLegacyTab(preferred);
    };

    nav.addEventListener('click', (event) => {
      const button = event.target.closest('.mobile-nav__button');
      if (button) showSection(button.dataset.mobileSection);
    });

    subnav.addEventListener('click', (event) => {
      const button = event.target.closest('.mobile-subnav__button');
      if (button) activateLegacyTab(button.dataset.tab);
    });

    moreList.addEventListener('click', (event) => {
      const button = event.target.closest('.mobile-action');
      if (!button) return;
      const action = button.dataset.action;

      if (action === 'contracts') {
        currentSection = 'grow';
        setNavState();
        renderSubnav();
        activateLegacyTab('upgrades');
        requestAnimationFrame(() => { document.getElementById('shop-list').scrollTop = 0; });
        return;
      }
      if (action === 'bestiary') {
        currentSection = 'legacy';
        setNavState();
        renderSubnav();
        activateLegacyTab('awaken');
        return;
      }

      const sourceId = { ranks: 'btn-ranks', store: 'btn-store', options: 'btn-options' }[action];
      const source = document.getElementById(sourceId);
      if (source && !source.hidden) source.click();
    });

    // Unlocks and attention pips are owned by UI.update(). Mirror those
    // attributes instead of recomputing game rules in this shell.
    const observer = new MutationObserver(() => {
      updateNavAvailability();
      renderSubnav();
      updateMoreAvailability();
      updatePips();
    });
    observer.observe(legacyTabs, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    for (const id of ['btn-ranks', 'btn-store', 'btn-options']) {
      const button = document.getElementById(id);
      if (button) observer.observe(button, { attributes: true, attributeFilter: ['hidden'] });
    }

    updateNavAvailability();
    showSection('battle');
  };

  if (globalThis.__rpg) onReady(globalThis.__rpg);
  else addEventListener('rpg:ready', (event) => onReady(event.detail), { once: true });
}
