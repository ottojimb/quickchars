# Changelog

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
