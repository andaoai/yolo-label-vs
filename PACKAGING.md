# VS Code Extension Packaging Guide

## Environment Setup
1. Ensure Node.js is installed (recommended version >= 14.0.0)
2. Install required development tools:
   ```bash
   npm install -g @vscode/vsce
   ```

## Packaging Steps

1. Install project dependencies
   ```bash
   npm install
   ```

2. Compile the project
   ```bash
   npm run compile
   ```

3. Package the extension
   ```bash
   vsce package
   ```
   This will generate `yolo-labeling-vs-0.0.1.vsix` in the project root directory

## Local Testing

1. Press `Ctrl+Shift+X` in VS Code to open Extensions panel
2. Click `...` in the top-right corner of the Extensions panel
3. Select "Install from VSIX..."
4. Choose the generated .vsix file

## Common Issues

1. "Missing publisher" error: Check if publisher field is set in package.json
2. Compilation errors: Verify TypeScript version
3. Missing fields error: Ensure all required fields are in package.json:
   - name
   - displayName
   - description
   - version
   - publisher
   - engines
   - main
   - activationEvents

## Version Updates

To update the version, modify the version field in package.json and rerun the package command. 