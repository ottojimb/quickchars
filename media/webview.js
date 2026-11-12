// @ts-check
(function () {
  // eslint-disable-next-line no-undef
  const vscode = acquireVsCodeApi();
  const root = /** @type {HTMLElement} */ (document.getElementById('root'));

  /** @type {any} */
  let state = null;
  let query = (vscode.getState() || {}).query || '';

  /**
   * @param {string} tag
   * @param {Record<string, any>} [props]
   * @param {(Node | string | null | false)[]} [children]
   */
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'className') {
        node.className = value;
      } else if (key.startsWith('on')) {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value !== undefined && value !== null && value !== false) {
        node.setAttribute(key, value === true ? '' : String(value));
      }
    }
    for (const child of children) {
      if (child) {
        node.append(child);
      }
    }
    return node;
  }

  /** @param {{label: string, text: string, isSnippet?: boolean}} item */
  function insert(item, copy = false) {
    vscode.postMessage({ command: 'insert', item, copy });
  }

  /** @param {{label: string, text: string, isSnippet?: boolean}} item */
  function makeButton(item) {
    const tooltip = (item.label !== item.text ? item.text + '\n\n' : '') + 'Click to insert, Alt+Click to copy';
    return el('vscode-button', {
      className: item.isSnippet ? 'snippet-button' : 'char-button',
      appearance: 'secondary',
      title: tooltip,
      onClick: (/** @type {MouseEvent} */ event) => insert(item, event.altKey)
    }, [item.label]);
  }

  /** @param {{label: string, text: string, isSnippet?: boolean}[]} items */
  function makeButtons(items) {
    const hasSnippets = items.some(item => item.isSnippet);
    const hasChars = items.some(item => !item.isSnippet);
    const kind = hasSnippets && hasChars ? 'mixed-container' : hasSnippets ? 'snippet-container' : 'char-container';
    return el('div', { className: `button-container ${kind}` }, items.map(makeButton));
  }

  /**
   * @param {{id: string, expanded: boolean}} group
   * @param {string} title
   * @param {Node[]} content
   * @param {boolean} forceExpanded
   */
  function makeGroup(group, title, content, forceExpanded) {
    const expanded = forceExpanded || group.expanded;
    const body = el('div', { className: expanded ? 'group-content' : 'group-content collapsed' }, content);
    const icon = el('span', { className: expanded ? 'collapse-icon' : 'collapse-icon collapsed' }, ['▼']);

    const toggle = () => {
      if (forceExpanded) {
        return;
      }
      group.expanded = !group.expanded;
      body.classList.toggle('collapsed', !group.expanded);
      icon.classList.toggle('collapsed', !group.expanded);
      header.setAttribute('aria-expanded', String(group.expanded));
      vscode.postMessage({ command: 'toggleGroup', groupId: group.id, isExpanded: group.expanded });
    };

    const header = el('div', {
      className: 'group-header',
      role: 'button',
      tabindex: 0,
      'aria-expanded': String(expanded),
      onClick: toggle,
      onKeydown: (/** @type {KeyboardEvent} */ event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      }
    }, [el('h3', {}, [title]), icon]);

    return el('div', { className: 'group-section' }, [header, body]);
  }

  /** @param {{label: string, text: string}} item */
  function matches(item, q) {
    return item.label.toLowerCase().includes(q) || item.text.toLowerCase().includes(q);
  }

  function getVisibleGroups() {
    const q = query.trim().toLowerCase();
    if (!q) {
      return state.groups;
    }
    return state.groups
      .map((/** @type {any} */ group) => ({
        ...group,
        items: group.name.toLowerCase().includes(q) ? group.items : group.items.filter((/** @type {any} */ item) => matches(item, q))
      }))
      .filter((/** @type {any} */ group) => group.items.length > 0);
  }

  function render() {
    if (!state) {
      return;
    }

    const hasContent = state.groups.some((/** @type {any} */ group) => group.items.length > 0);
    if (!hasContent) {
      root.replaceChildren(el('div', { className: 'empty-state' }, [
        el('h3', {}, ['No items to show']),
        el('p', {}, ['All groups are currently empty.']),
        el('div', { className: 'settings-hint' }, ['Open Settings and search for "QuickChars" to add custom groups and items.']),
        el('vscode-button', { onClick: () => vscode.postMessage({ command: 'openSettings' }) }, ['Open Settings'])
      ]));
      return;
    }

    const searching = query.trim().length > 0;
    const sections = [];

    if (state.showInfoBanner && !searching) {
      sections.push(el('div', { className: 'info-banner' }, [
        el('div', { className: 'title' }, ['Default Configuration Example']),
        el('div', { className: 'description' }, ['This is a sample configuration to get you started. For the best experience, customize your own groups and items.']),
        el('span', { className: 'settings-link', role: 'link', tabindex: 0, onClick: () => vscode.postMessage({ command: 'openSettings' }) }, ['Click here to open QuickChars Settings'])
      ]));
    }

    if (state.showRecentlyUsed && !searching) {
      const recent = state.recentlyUsed;
      const content = recent.items.length > 0
        ? [makeButtons(recent.items), el('div', { className: 'clear-recent' }, [
          el('span', { role: 'button', tabindex: 0, onClick: () => vscode.postMessage({ command: 'clearRecentlyUsed' }) }, ['clear'])
        ])]
        : [el('div', { className: 'recent-empty' }, [
          el('p', {}, ['No recently used items yet.']),
          el('p', {}, ['Items you use will appear here for quick access.'])
        ])];
      sections.push(makeGroup(recent, 'Recently Used', content, false));
    }

    const groups = getVisibleGroups();
    for (const group of groups) {
      sections.push(makeGroup(group, group.name, [makeButtons(group.items)], searching));
    }

    if (searching && groups.length === 0) {
      sections.push(el('div', { className: 'recent-empty' }, [el('p', {}, [`No items match "${query.trim()}".`])]));
    }

    root.replaceChildren(...sections);
  }

  const search = /** @type {HTMLInputElement} */ (el('input', {
    className: 'search-input',
    type: 'search',
    placeholder: 'Search characters and snippets',
    'aria-label': 'Search characters and snippets',
    onInput: () => {
      query = search.value;
      vscode.setState({ query });
      render();
    },
    onKeydown: (/** @type {KeyboardEvent} */ event) => {
      if (event.key === 'Escape') {
        search.value = '';
        search.dispatchEvent(new Event('input'));
      } else if (event.key === 'Enter') {
        const first = getVisibleGroups()[0]?.items[0];
        if (first && query.trim()) {
          insert(first, event.altKey);
        }
      }
    }
  }));
  search.value = query;
  document.body.insertBefore(el('div', { className: 'search-bar' }, [search]), root);

  window.addEventListener('message', event => {
    if (event.data?.command === 'state') {
      state = event.data;
      render();
    }
  });

  vscode.postMessage({ command: 'ready' });
})();
