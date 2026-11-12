import * as vscode from 'vscode';

export interface QuickItem {
  label: string;
  text: string;
  isSnippet?: boolean;
}

interface QuickGroup {
  name: string;
  items: QuickItem[];
}

interface RecentItem extends QuickItem {
  count: number;
  lastUsed: number;
}

const RECENT_KEY = 'quickChars.recentlyUsed';
const RECENT_GROUP_ID = 'recentlyUsed';
const MAX_RECENT = 50;

export function activate(context: vscode.ExtensionContext) {
  const provider = new QuickCharsViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('quickCharsView', provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.window.registerWebviewViewProvider('quickCharsViewInExplorer', provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),

    vscode.commands.registerCommand('quickChars.toggleActivityBar', () => toggleSetting('showInActivityBar', 'Activity Bar')),
    vscode.commands.registerCommand('quickChars.toggleExplorer', () => toggleSetting('showInExplorer', 'Explorer')),

    vscode.commands.registerCommand('quickChars.clearRecentlyUsed', async () => {
      await context.globalState.update(RECENT_KEY, []);
      provider.refresh();
      vscode.window.showInformationMessage('Recently used items cleared');
    }),

    vscode.commands.registerCommand('quickChars.insertItem', () => provider.showQuickPick()),

    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('quickChars')) {
        provider.refresh();
      }
    })
  );
}

async function toggleSetting(setting: string, place: string) {
  const config = vscode.workspace.getConfiguration('quickChars');
  const enabled = !config.get<boolean>(setting, true);
  await config.update(setting, enabled, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`QuickChars panel ${enabled ? 'enabled' : 'disabled'} in ${place}`);
}

/** Items stored before 1.1.0 have no isSnippet flag; infer it from snippet syntax. */
export function isSnippetItem(item: QuickItem): boolean {
  return item.isSnippet ?? /\$(\d|\{)/.test(item.text);
}

/** Snippet items keep their tab stops; any other item is inserted literally. */
export function toSnippet(item: QuickItem): vscode.SnippetString {
  return isSnippetItem(item)
    ? new vscode.SnippetString(item.text)
    : new vscode.SnippetString().appendText(item.text);
}

class QuickCharsViewProvider implements vscode.WebviewViewProvider {
  private readonly views = new Set<vscode.WebviewView>();
  private lastEditor?: vscode.TextEditor;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.lastEditor = vscode.window.activeTextEditor;
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          this.lastEditor = editor;
        }
      })
    );
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.views.add(view);
    view.onDidDispose(() => this.views.delete(view));

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        vscode.Uri.joinPath(this.context.extensionUri, 'out', 'styles'),
        this.getElementsDir()
      ]
    };
    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage(async message => {
      switch (message.command) {
        case 'ready':
          this.postState(view);
          break;
        case 'insert':
          await this.insert(message.item as QuickItem, message.copy === true);
          break;
        case 'toggleGroup':
          await this.context.globalState.update(`quickChars.groupState.${message.groupId}`, message.isExpanded);
          break;
        case 'openSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', 'quickChars');
          break;
        case 'clearRecentlyUsed':
          vscode.commands.executeCommand('quickChars.clearRecentlyUsed');
          break;
      }
    });
  }

  public refresh() {
    this.views.forEach(view => this.postState(view));
  }

  public async showQuickPick() {
    type Pick = vscode.QuickPickItem & { item?: QuickItem };
    const picks: Pick[] = [];
    const addSection = (title: string, items: QuickItem[]) => {
      if (items.length === 0) {
        return;
      }
      picks.push({ label: title, kind: vscode.QuickPickItemKind.Separator });
      items.forEach(item => picks.push({
        label: item.label,
        description: item.label === item.text ? undefined : item.text.replace(/\s+/g, ' '),
        item
      }));
    };

    addSection('Recently Used', this.getRecentlyUsed());
    this.getGroups().forEach(group => addSection(group.name, group.items));

    const picked = await vscode.window.showQuickPick(picks, {
      placeHolder: 'Search characters and snippets',
      matchOnDescription: true
    });
    if (picked?.item) {
      await this.insert(picked.item, false);
    }
  }

  private async insert(item: QuickItem, copyOnly: boolean) {
    const editor = vscode.window.activeTextEditor ?? this.lastEditor;
    const isOpen = editor && vscode.window.visibleTextEditors.includes(editor);

    if (copyOnly || !editor || !isOpen) {
      await vscode.env.clipboard.writeText(item.text);
      vscode.window.setStatusBarMessage(`QuickChars: copied "${item.label}" to clipboard`, 2500);
    } else {
      await editor.insertSnippet(toSnippet(item));
      // Return focus to the editor so the user can keep typing.
      await vscode.window.showTextDocument(editor.document, editor.viewColumn);
    }

    await this.trackUsage(item);
    this.refresh();
  }

  private getGroups(): QuickGroup[] {
    const groups = vscode.workspace.getConfiguration('quickChars').get<QuickGroup[]>('groups') ?? [];
    return groups
      .filter(group => group && typeof group.name === 'string')
      .map(group => ({
        name: group.name,
        items: (Array.isArray(group.items) ? group.items : [])
          .filter(item => item && typeof item.text === 'string')
          .map(item => ({ label: item.label ?? item.text, text: item.text, isSnippet: item.isSnippet === true }))
      }));
  }

  private getRecentLimit(): number {
    const limit = vscode.workspace.getConfiguration('quickChars').get<number>('recentlyUsedLimit', 10);
    return Math.max(1, Math.min(MAX_RECENT, limit));
  }

  private getRecentlyUsed(): RecentItem[] {
    const config = vscode.workspace.getConfiguration('quickChars');
    if (!config.get<boolean>('showRecentlyUsed', true)) {
      return [];
    }
    const stored = this.context.globalState.get<RecentItem[]>(RECENT_KEY) ?? [];
    return stored.slice(0, this.getRecentLimit()).map(item => ({ ...item, isSnippet: isSnippetItem(item) }));
  }

  private async trackUsage(item: QuickItem) {
    if (!vscode.workspace.getConfiguration('quickChars').get<boolean>('showRecentlyUsed', true)) {
      return;
    }

    const recent = this.context.globalState.get<RecentItem[]>(RECENT_KEY) ?? [];
    const now = Date.now();
    const existing = recent.find(entry => entry.text === item.text);

    if (existing) {
      existing.count++;
      existing.lastUsed = now;
      existing.label = item.label;
      existing.isSnippet = isSnippetItem(item);
    } else {
      recent.push({ label: item.label, text: item.text, isSnippet: isSnippetItem(item), count: 1, lastUsed: now });
    }

    recent.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
    await this.context.globalState.update(RECENT_KEY, recent.slice(0, this.getRecentLimit()));
  }

  private getGroupExpanded(groupId: string, defaultExpanded: boolean): boolean {
    return this.context.globalState.get<boolean>(`quickChars.groupState.${groupId}`) ?? defaultExpanded;
  }

  private postState(view: vscode.WebviewView) {
    const config = vscode.workspace.getConfiguration('quickChars');
    const groups = this.getGroups();

    view.webview.postMessage({
      command: 'state',
      showInfoBanner: config.get<boolean>('showInfoBanner', true),
      showRecentlyUsed: config.get<boolean>('showRecentlyUsed', true),
      recentlyUsed: {
        id: RECENT_GROUP_ID,
        expanded: this.getGroupExpanded(RECENT_GROUP_ID, true),
        items: this.getRecentlyUsed().map(({ label, text, isSnippet }) => ({ label, text, isSnippet }))
      },
      groups: groups.map((group, index) => ({
        id: group.name,
        name: group.name,
        expanded: this.getGroupExpanded(group.name, index === 0),
        items: group.items
      }))
    });
  }

  private getElementsDir(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@vscode-elements', 'elements', 'dist');
  }

  private getHtml(webview: vscode.Webview): string {
    const asUri = (...segments: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, ...segments));
    const elementsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.getElementsDir(), 'bundled.js'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${asUri('out', 'styles', 'webview.css')}">
  <script type="module" nonce="${nonce}" src="${elementsUri}"></script>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${asUri('media', 'webview.js')}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

export function deactivate() { }
