# Changelog

## [1.1.0] - 2026-11-11

### Added
- Search box to filter items by label, text or group name (`Enter` inserts the first match, `Escape` clears)
- `QuickChars: Insert Character or Snippet...` command to insert any item from the Command Palette
- Alt+Click copies an item to the clipboard; items are also copied when no editor is open
- Keyboard navigation for group headers

### Changed
- Focus returns to the editor after inserting an item
- Items without `isSnippet: true` are inserted literally, so `$`, `{` and `\` are no longer interpreted as snippet syntax
- The panel updates in place instead of reloading, keeping the scroll position after each insertion
- Added a Content Security Policy to the webview
- Removed emojis from the README

### Fixed
- Snippets using `${1:placeholder}`, double quotes or backticks broke their button
- Only one panel refreshed when QuickChars was shown in both the Activity Bar and the Explorer
- README listed VS Code 1.102 as the minimum version instead of 1.95

## [1.0.5] - 2026-11-11

### Changed
- The webview now loads `@vscode-elements` from the extension package instead of an unpinned CDN URL, so it works offline and cannot break on upstream major releases
- Reduced the VSIX package from 2.7 MB to under 70 KB by excluding unused `node_modules`, screenshots, tests and CI files
- Release workflow uses `actions/checkout@v5` and `actions/setup-node@v5`

## [1.0.4] - 2026-11-11

### Changed
- Updated development dependencies (TypeScript 5.9, ESLint 9.39, typescript-eslint 8.72, @vscode/test-cli 0.0.15) and applied security fixes to the lockfile
- Modernized the release workflow: Node.js 22, lint step, tag/version check, release notes taken from the changelog, and `gh release create` instead of the deprecated release actions

## [1.0.3] - 2025-07-31

### Fixed
- **Cursor Compatibility**: Lowered VS Code engine requirement from ^1.99.3 to ^1.95.0 for compatibility with Cursor IDE
- **Clear Recent Items**: Discrete "clear" link to remove all recently used items
- **Empty State Messaging**: Helpful message when no recently used items exist
- **Configuration Options**:
  - Toggle recently used section on/off
  - Configure limit (1-50 items) for recently used items
  - Real-time configuration updates
- Updated @types/vscode dependency to match engine requirements

## [1.0.2] - 2025-07-30

### Added
- **Recently Used Functionality**: Track and display recently used characters/snippets with smart frequency/recency sorting
- **Visual Improvements**: Enhanced UI styling with centered button grid layout

### Changed
- Improved button grid centering while maintaining left-aligned buttons
- Updated clear button to be a small, discrete link instead of a prominent button
- Enhanced visual design without gradients for better VS Code theme integration

## [1.0.1] - 2025-07-30
- Bugfix

## [1.0.0] - 2025-07-30

🎉 Initial release of QuickChars
- Quick insertion of special characters, emojis, and code snippets
- Customizable groups and persistent UI state
