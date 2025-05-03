# CI/CD Workflow Guide

This document describes the CI/CD (Continuous Integration/Continuous Deployment) workflow used in the YOLO Label VS extension project.

## Table of Contents
1. [Overview](#overview)
2. [GitHub Actions Workflow](#github-actions-workflow)
3. [Workflow Configuration](#workflow-configuration)
4. [Release Process](#release-process)
5. [Automated Tasks](#automated-tasks)
6. [Troubleshooting](#troubleshooting)

## Overview

Our CI/CD pipeline automates the testing, building, and publishing process for the YOLO Label VS extension. This helps ensure code quality and simplifies the release process.

**Key Benefits:**
- Automatic validation of code changes
- Consistent build and packaging
- Automated version management
- Automated publishing to the Visual Studio Code Marketplace
- Reduced manual intervention in the release process

## GitHub Actions Workflow

We use GitHub Actions to implement our CI/CD pipeline. The workflow is triggered by specific events in the repository.

### Workflow Triggers

The CI/CD workflows are triggered by the following events:
- **main-publish.yml**: Manual dispatch or push to the `main` branch
- **version-updater.yml**: Manual dispatch or push to the `dev` branch (ignoring changes to package.json)

### Workflow Files

The workflow configurations are stored in the `.github/workflows/` directory:

- `main-publish.yml`: Main workflow for building, creating releases, and publishing the extension
- `version-updater.yml`: Workflow for automatically incrementing patch version in development branch

## Workflow Configuration

### Main Publishing Workflow

The `main-publish.yml` workflow performs the following steps:

1. **Checkout**: Retrieves the latest code from the repository
2. **Setup Node.js**: Configures the Node.js environment (version 20.x)
3. **Get Current Version**: Extracts version from package.json
4. **Install Dependencies**: Removes package-lock.json and installs necessary npm packages
5. **Compile**: Compiles the TypeScript code
6. **Package**: Creates the VSIX package for the extension
7. **Create GitHub Release**: Creates a new release with the current version number
8. **Upload VSIX to Release**: Attaches the VSIX package to the GitHub release
9. **Publish**: Publishes the extension to the VS Code Marketplace

```yaml
name: Publish to VS Code Marketplace

on:
  workflow_dispatch:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  publish-to-marketplace:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && !contains(github.event.head_commit.message, '[skip ci]')
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.PAT_TOKEN }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20.x'
      
      - name: Get current version
        id: current_version
        run: echo "version=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
        
      - name: Delete package-lock.json and install dependencies
        run: |
          rm -f package-lock.json
          npm install --no-package-lock --ignore-scripts
        
      - name: Compile extension
        run: npm run compile
        
      - name: Package extension
        run: |
          npm install -g @vscode/vsce
          vsce package
          
      - name: Create GitHub Release
        id: create_release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}
        with:
          tag_name: v${{ steps.current_version.outputs.version }}
          release_name: Release v${{ steps.current_version.outputs.version }}
          draft: false
          prerelease: false
          body: |
            New version released to VS Code Marketplace.
            Version: ${{ steps.current_version.outputs.version }}
      
      - name: Upload VSIX to Release
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}
        with:
          upload_url: ${{ steps.create_release.outputs.upload_url }}
          asset_path: ./yolo-labeling-vs-${{ steps.current_version.outputs.version }}.vsix
          asset_name: yolo-labeling-vs-${{ steps.current_version.outputs.version }}.vsix
          asset_content_type: application/octet-stream
      
      - name: Publish to Visual Studio Marketplace
        uses: HaaLeo/publish-vscode-extension@v1
        with:
          pat: ${{ secrets.VSCE_TOKEN }}
          registryUrl: https://marketplace.visualstudio.com
```

### Version Updater Workflow

The `version-updater.yml` workflow automatically increments the patch version in the `dev` branch:

1. **Checkout**: Retrieves the code from the repository
2. **Setup Node.js**: Configures the Node.js environment (version 20.x)
3. **Get Current Version**: Extracts current version from package.json
4. **Bump Patch Version**: Increments the patch version (the third number)
5. **Update Package.json**: Updates the version in package.json
6. **Commit and Push**: Commits and pushes the change back to the repository
7. **Install Dependencies**: Removes package-lock.json and installs necessary packages
8. **Compile & Package**: Builds and packages the extension for testing

```yaml
name: Update Version for Dev Branch

on:
  workflow_dispatch:
  push:
    branches: [dev]
    paths-ignore:
      - 'package.json'

permissions:
  contents: write

jobs:
  update-version:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/dev' && !contains(github.event.head_commit.message, '[skip ci]')
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.PAT_TOKEN }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20.x'
      
      - name: Get current version
        id: current_version
        run: echo "version=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
        
      - name: Bump patch version (third number)
        id: new_version
        run: |
          CURRENT=${{ steps.current_version.outputs.version }}
          MAJOR=$(echo $CURRENT | cut -d. -f1)
          MINOR=$(echo $CURRENT | cut -d. -f2)
          PATCH=$(echo $CURRENT | cut -d. -f3)
          NEWPATCH=$((PATCH + 1))
          NEWVERSION="$MAJOR.$MINOR.$NEWPATCH"
          echo "version=$NEWVERSION" >> $GITHUB_OUTPUT
          
      - name: Update package.json version
        run: |
          npm version ${{ steps.new_version.outputs.version }} --no-git-tag-version
          
      - name: Commit and push changes
        run: |
          git config --global user.name "GitHub Action"
          git config --global user.email "action@github.com"
          git add package.json
          git commit -m "Bump patch version to ${{ steps.new_version.outputs.version }} for dev release [skip ci]"
          git push
```

## Release Process

The release process follows these steps:

1. **Development**: Features are developed in feature branches
2. **Pull Request**: Changes are submitted via pull request to the `dev` branch
3. **Code Review**: The PR is reviewed and approved
4. **Merge to Dev**: Approved changes are merged to the `dev` branch
   - The `version-updater.yml` workflow automatically increments the patch version
5. **Testing**: The changes are tested in the `dev` branch
6. **Merge to Main**: When ready for release, the `dev` branch is merged to `main`
7. **Automated Release & Publishing**: The `main-publish.yml` workflow automatically:
   - Creates a GitHub release with the version tag
   - Publishes the extension to the VS Code Marketplace

### Version Management

The project uses semantic versioning (`vX.Y.Z`):
- **Major version (X)**: Incompatible API changes
- **Minor version (Y)**: Backward-compatible functionality addition
- **Patch version (Z)**: Backward-compatible bug fixes

For development work, the patch version is automatically incremented by the version-updater workflow.

## Automated Tasks

The CI/CD workflow automates the following tasks:

1. **Version Management**: Automatically increments patch version on `dev` branch
2. **Building**: Compiles TypeScript code to JavaScript
3. **Packaging**: Creates the VSIX package for the extension
4. **Release Creation**: Creates GitHub releases with proper versioning
5. **Publishing**: Uploads the extension to the VS Code Marketplace

### Configuration Files

Key configuration files:

- `package.json`: Contains the extension metadata and scripts
- `.github/workflows/*.yml`: GitHub Actions workflow configurations
- `.vscodeignore`: Specifies files to exclude from the extension package

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check the GitHub Actions logs for specific errors
   - Ensure all dependencies are correctly specified in `package.json`
   - Verify that the code passes compilation

2. **Publishing Failures**
   - Verify that the Personal Access Token (PAT_TOKEN) and VSCE Token (VSCE_TOKEN) are valid and have the correct permissions
   - Check if the version in `package.json` conforms to semantic versioning
   - Ensure the `publisher` field in `package.json` is correct

3. **Version Conflicts**
   - If manual version changes are made, ensure they don't conflict with the automatic versioning
   - Avoid direct edits to `package.json` version on the `dev` branch

### Getting Help

If you encounter issues with the CI/CD workflow:

1. Check the GitHub Actions logs for detailed error messages
2. Review the [VS Code Extension Publishing documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
3. Submit an issue through our [issue tracker](https://github.com/andaoai/yolo-label-vs/issues)

---

This documentation is maintained by the YOLO Label VS development team. For questions or suggestions, please create an issue in the repository. 