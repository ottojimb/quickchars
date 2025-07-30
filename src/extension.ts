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
        }
      } else if (message.command === 'openSettings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'quickChars');
      } else if (message.command === 'toggleGroup') {
        this.saveGroupState(message.groupIndex, message.isExpanded);
      }
    });

    const configListener = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('quickChars.groups') ||
          e.affectsConfiguration('quickChars.showInfoBanner')) {
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

    this._view.webview.html = this.getHtml(this._view.webview, allGroups);
  }

  private saveGroupState(groupIndex: number, isExpanded: boolean) {
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
  }  getHtml(webview: vscode.Webview, groups: Array<{ name: string, items: Array<{ label: string, text: string, isSnippet?: boolean }> }>) {
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

    const makeButton = (label: string, text: string, isSnippet: boolean = false) => {
      const buttonClass = isSnippet ? 'snippet-button' : 'char-button';
      return `<vscode-button class="${buttonClass}" appearance="secondary" onclick="send(\`${text.replace(/`/g, '\\`')}\`)">${label}</vscode-button>`;
    };

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
      const contentClass = isCollapsed ? 'group-content collapsed' : 'group-content';      return `
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

      ${groupSections}

      <script>
        const vscode = acquireVsCodeApi();
        function send(text) {
          vscode.postMessage({ command: 'insert', text });
        }
        function openSettings() {
          vscode.postMessage({ command: 'openSettings' });
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
