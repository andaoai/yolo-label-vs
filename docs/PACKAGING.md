# <img src="./images/icon.png" width="32" height="32" alt="YOLO Label Tool Icon"> Packaging Guide

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

2. Build the project using webpack and copy template files
   ```bash
   npm run build
   ```
   This step will:
   - Bundle all source code using webpack
   - Output bundled files to `dist` directory
   - **Copy template files from `src/templates` to `dist/templates` directory using a custom Node.js script**

   > **Note:**
   > The template files (such as HTML, CSS, JS, and subdirectories) required by the extension UI are stored in the `src/templates` directory. These files are not bundled by webpack and must be copied manually to the output directory. This is handled by the `scripts/copy-templates.js` script, which recursively copies all files and folders from `src/templates` to `dist/templates`.
   >
   > If you add or modify any template files, make sure they are placed in `src/templates` so they will be included in the final package.

3. Package the extension
   ```bash
   vsce package
   ```
   This will generate `yolo-labeling-vs-x.x.x.vsix` in the project root directory (where x.x.x is the version number)

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
4. Webpack build errors: Make sure webpack.config.js is properly configured and all dependencies are installed:
   ```bash
   npm install --save-dev webpack webpack-cli ts-loader
   ```

## Version Updates

To update the version, modify the version field in package.json and rerun the package command. 