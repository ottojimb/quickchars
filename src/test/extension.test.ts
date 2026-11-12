import * as assert from 'assert';
import * as vscode from 'vscode';
import { isSnippetItem, toSnippet } from '../extension';

suite('QuickChars', () => {
	async function insertInto(text: string, isSnippet?: boolean): Promise<string> {
		const doc = await vscode.workspace.openTextDocument({ content: '' });
		const editor = await vscode.window.showTextDocument(doc);
		await editor.insertSnippet(toSnippet({ label: text, text, isSnippet }));
		return doc.getText();
	}

	test('registers its commands', async () => {
		await vscode.extensions.getExtension('ottojimb.quickchars')?.activate();
		const commands = await vscode.commands.getCommands(true);
		for (const id of ['quickChars.insertItem', 'quickChars.clearRecentlyUsed', 'quickChars.toggleExplorer', 'quickChars.toggleActivityBar']) {
			assert.ok(commands.includes(id), `missing command ${id}`);
		}
	});

	test('inserts characters literally', async () => {
		assert.strictEqual(await insertInto('$1 ${x} \\ }', false), '$1 ${x} \\ }');
	});

	test('inserts snippets with placeholders', async () => {
		assert.strictEqual(await insertInto('log(${1:value});$0', true), 'log(value);');
	});

	test('infers snippet flag for legacy recent items', () => {
		assert.strictEqual(isSnippetItem({ label: 'a', text: 'console.log($1)' }), true);
		assert.strictEqual(isSnippetItem({ label: '€', text: '€' }), false);
		assert.strictEqual(isSnippetItem({ label: '$', text: '$' }), false);
	});
});
