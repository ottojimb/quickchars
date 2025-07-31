import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
  console.log('QuickChars extension activated!');

  const provider = new QuickCharsViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('quickCharsView', provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }),
    vscode.window.registerWebviewViewProvider('quickCharsViewInExplorer', provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('quickChars.toggleActivityBar', () => {
      const config = vscode.workspace.getConfiguration('quickChars');
      const currentValue = config.get<boolean>('showInActivityBar', true);
      config.update('showInActivityBar', !currentValue, vscode.ConfigurationTarget.Global);

      const message = !currentValue ? 'QuickChars panel enabled in Activity Bar' : 'QuickChars panel disabled in Activity Bar';
      vscode.window.showInformationMessage(message);
    }),

    vscode.commands.registerCommand('quickChars.toggleExplorer', () => {
      const config = vscode.workspace.getConfiguration('quickChars');
      const currentValue = config.get<boolean>('showInExplorer', true);
      config.update('showInExplorer', !currentValue, vscode.ConfigurationTarget.Global);

      const message = !currentValue ? 'QuickChars panel enabled in Explorer' : 'QuickChars panel disabled in Explorer';
      vscode.window.showInformationMessage(message);
    }),

    vscode.commands.registerCommand('quickChars.clearRecentlyUsed', () => {
      const key = 'quickChars.recentlyUsed';
      context.globalState.update(key, []);
      vscode.window.showInformationMessage('Recently used items cleared');

      provider.refreshView();
    })
  );
}

class QuickCharsViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) { }

  private loadStyles(): string {
    try {
      const stylesPath = path.join(this.context.extensionPath, 'out', 'styles', 'webview.css');
      return fs.readFileSync(stylesPath, 'utf8');
    } catch (error) {
      console.error('Failed to load styles:', error);
      return '/* Styles could not be loaded */';
    }
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this._view = view;
    view.webview.options = { enableScripts: true };

    this.updateWebview();

    view.webview.onDidReceiveMessage(message => {
      if (message.command === 'insert') {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.insertSnippet(new vscode.SnippetString(message.text));
          this.trackUsage(message.text, message.label || message.text);
          this.updateWebview();
        }
      } else if (message.command === 'openSettings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'quickChars');
      } else if (message.command === 'toggleGroup') {
        this.saveGroupState(message.groupIndex, message.isExpanded);
      } else if (message.command === 'clearRecentlyUsed') {
        vscode.commands.executeCommand('quickChars.clearRecentlyUsed');
      }
    });

    const configListener = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('quickChars.groups') ||
        e.affectsConfiguration('quickChars.showInfoBanner') ||
        e.affectsConfiguration('quickChars.showRecentlyUsed') ||
        e.affectsConfiguration('quickChars.recentlyUsedLimit')) {
        this.updateWebview();
      }
    });

    view.onDidDispose(() => {
      configListener.dispose();
    });
  }

  private updateWebview() {
    if (!this._view) {
      return;
    }

    const config = vscode.workspace.getConfiguration('quickChars');
    const allGroups = config.get<Array<{ name: string, items: Array<{ label: string, text: string, isSnippet?: boolean }> }>>('groups') || [];

    this.updateRecentlyUsedLimit();

    this._view.webview.html = this.getHtml(this._view.webview, allGroups);
  }

  public refreshView() {
    this.updateWebview();
  }

  private updateRecentlyUsedLimit() {
    const config = vscode.workspace.getConfiguration('quickChars');
    const showRecentlyUsed = config.get<boolean>('showRecentlyUsed', true);
    const limit = config.get<number>('recentlyUsedLimit', 10);

    if (!showRecentlyUsed) {
      return;
    }

    const key = 'quickChars.recentlyUsed';
    const recentlyUsed = this.context.globalState.get<Array<{ text: string, label: string, count: number, lastUsed: number }>>(key) || [];

    if (recentlyUsed.length > limit) {
      const trimmedRecentlyUsed = recentlyUsed.slice(0, Math.max(1, Math.min(50, limit)));
      this.context.globalState.update(key, trimmedRecentlyUsed);
    }
  }

  private saveGroupState(groupIndex: number, isExpanded: boolean) {
    if (groupIndex === -1) {
      const key = 'quickChars.groupState.recentlyUsed';
      this.context.globalState.update(key, isExpanded);
      return;
    }

    const config = vscode.workspace.getConfiguration('quickChars');
    const groups = config.get<Array<{ name: string, items: Array<{ label: string, text: string, isSnippet?: boolean }> }>>('groups') || [];

    if (groupIndex < groups.length) {
      const groupName = groups[groupIndex].name;
      const key = `quickChars.groupState.${groupName}`;
      this.context.globalState.update(key, isExpanded);
    }
  }

  private getGroupState(groupName: string, defaultExpanded: boolean): boolean {
    const key = `quickChars.groupState.${groupName}`;
    const savedState = this.context.globalState.get<boolean>(key);
    return savedState !== undefined ? savedState : defaultExpanded;
  }

  private trackUsage(text: string, label: string) {
    const config = vscode.workspace.getConfiguration('quickChars');
    const showRecentlyUsed = config.get<boolean>('showRecentlyUsed', true);

    if (!showRecentlyUsed) {
      return;
    }

    const limit = config.get<number>('recentlyUsedLimit', 10);
    const key = 'quickChars.recentlyUsed';
    const recentlyUsed = this.context.globalState.get<Array<{ text: string, label: string, count: number, lastUsed: number }>>(key) || [];

    const now = Date.now();
    const existingIndex = recentlyUsed.findIndex(item => item.text === text);

    if (existingIndex >= 0) {
      recentlyUsed[existingIndex].count++;
      recentlyUsed[existingIndex].lastUsed = now;
    } else {
      recentlyUsed.push({ text, label, count: 1, lastUsed: now });
    }

    recentlyUsed.sort((a, b) => {
      if (a.count !== b.count) {
        return b.count - a.count;
      }
      return b.lastUsed - a.lastUsed;
    });

    const topRecentlyUsed = recentlyUsed.slice(0, Math.max(1, Math.min(50, limit)));

    this.context.globalState.update(key, topRecentlyUsed);
  }

  private getRecentlyUsed(): Array<{ text: string, label: string, count: number, lastUsed: number }> {
    const key = 'quickChars.recentlyUsed';
    return this.context.globalState.get<Array<{ text: string, label: string, count: number, lastUsed: number }>>(key) || [];
  } getHtml(webview: vscode.Webview, groups: Array<{ name: string, items: Array<{ label: string, text: string, isSnippet?: boolean }> }>) {
    const hasContent = groups.length > 0 && groups.some(group => group.items.length > 0);

    if (!hasContent) {
      const styles = this.loadStyles();
      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script type="module" src="https://unpkg.com/@vscode-elements/elements/dist/bundled.js"></script>
          <style>${styles}</style>
        </head>
        <body>
          <div class="empty-state">
            <h3>No items to show</h3>
            <p>All groups are currently empty.</p>
            <div class="settings-hint">
              💡 Open Settings and search for "QuickChars" to add custom groups and items.
            </div>
          </div>
        </body>
        </html>
      `;
    }

    const config = vscode.workspace.getConfiguration('quickChars');
    const showInfoBanner = config.get<boolean>('showInfoBanner', true);
    const showRecentlyUsed = config.get<boolean>('showRecentlyUsed', true);

    const makeButton = (label: string, text: string, isSnippet: boolean = false) => {
      const buttonClass = isSnippet ? 'snippet-button' : 'char-button';
      return `<vscode-button class="${buttonClass}" appearance="secondary" onclick="send(\`${text.replace(/`/g, '\\`')}\`, \`${label.replace(/`/g, '\\`')}\`)">${label}</vscode-button>`;
    };

    const recentlyUsed = showRecentlyUsed ? this.getRecentlyUsed() : [];
    const recentlyUsedExpanded = this.getGroupState('recentlyUsed', true);
    const recentlyUsedCollapsed = !recentlyUsedExpanded;
    const recentlyUsedIconClass = recentlyUsedCollapsed ? 'collapse-icon collapsed' : 'collapse-icon';
    const recentlyUsedContentClass = recentlyUsedCollapsed ? 'group-content collapsed' : 'group-content';

    const recentlyUsedSection = showRecentlyUsed ? `
      <div class="group-section">
        <div class="group-header" onclick="toggleGroup(-1)">
          <h3>Recently Used</h3>
          <span class="${recentlyUsedIconClass}" id="icon--1">▼</span>
        </div>
        <div class="${recentlyUsedContentClass}" id="content--1">
          ${recentlyUsed.length > 0 ? `
            <div class="button-container char-container">
              ${recentlyUsed.map(item => makeButton(item.label, item.text, item.text.includes('$'))).join('')}
            </div>
            <div style="margin-top: 0.5rem; text-align: center;">
              <span onclick="clearRecentlyUsed()" style="font-size: 0.7rem; color: var(--vscode-descriptionForeground); cursor: pointer; text-decoration: underline; opacity: 0.7; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">clear</span>
            </div>
          ` : `
            <div style="text-align: center; padding: 1rem; color: var(--vscode-descriptionForeground); font-size: 0.85rem;">
              <p>No recently used items yet.</p>
              <p>Items you use will appear here for quick access.</p>
            </div>
          `}
        </div>
      </div>
    ` : '';

    const groupSections = groups.map((group, index) => {
      const hasSnippets = group.items.some(item => item.isSnippet === true);
      const hasCharacters = group.items.some(item => item.isSnippet !== true);

      let containerClass = 'char-container';
      if (hasSnippets && !hasCharacters) {
        containerClass = 'snippet-container';
      } else if (hasSnippets && hasCharacters) {
        containerClass = 'mixed-container';
      }

      const buttons = group.items.map(item => makeButton(item.label, item.text, item.isSnippet === true)).join('');

      const defaultExpanded = index === 0;
      const isExpanded = this.getGroupState(group.name, defaultExpanded);
      const isCollapsed = !isExpanded;

      const collapseIconClass = isCollapsed ? 'collapse-icon collapsed' : 'collapse-icon';
      const contentClass = isCollapsed ? 'group-content collapsed' : 'group-content'; return `
        <div class="group-section">
          <div class="group-header" onclick="toggleGroup(${index})">
            <h3>${group.name}</h3>
            <span class="${collapseIconClass}" id="icon-${index}">▼</span>
          </div>
          <div class="${contentClass}" id="content-${index}">
            <div class="button-container ${containerClass}">
              ${buttons}
            </div>
          </div>
        </div>
      `;
    }).join('');

    const styles = this.loadStyles();

    const infoBanner = showInfoBanner ? `
      <div class="info-banner">
        <div class="title">Default Configuration Example</div>
        <div class="description">
          This is a sample configuration to get you started. For the best experience, customize your own groups and items.
        </div>
        <span class="settings-link" onclick="openSettings()">Click here to open QuickChars Settings</span>
      </div>
    ` : '';

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script type="module" src="https://unpkg.com/@vscode-elements/elements/dist/bundled.js"></script>
      <style>${styles}</style>
    </head>
    <body>
      ${infoBanner}

      ${recentlyUsedSection}

      ${groupSections}

      <script>
        const vscode = acquireVsCodeApi();
        function send(text, label) {
          vscode.postMessage({ command: 'insert', text, label });
        }
        function openSettings() {
          vscode.postMessage({ command: 'openSettings' });
        }
        function clearRecentlyUsed() {
          vscode.postMessage({ command: 'clearRecentlyUsed' });
        }
        function toggleGroup(index) {
          const content = document.getElementById('content-' + index);
          const icon = document.getElementById('icon-' + index);

          let isExpanded;
          if (content.classList.contains('collapsed')) {
            content.classList.remove('collapsed');
            icon.classList.remove('collapsed');
            isExpanded = true;
          } else {
            content.classList.add('collapsed');
            icon.classList.add('collapsed');
            isExpanded = false;
          }

          vscode.postMessage({
            command: 'toggleGroup',
            groupIndex: index,
            isExpanded: isExpanded
          });
        }
      </script>
    </body>
    </html>
  `;
  }
}

export function deactivate(context: vscode.ExtensionContext) { }
