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
- Automated publishing to the Visual Studio Code Marketplace
- Reduced manual intervention in the release process

## GitHub Actions Workflow

We use GitHub Actions to implement our CI/CD pipeline. The workflow is triggered by specific events in the repository.

### Workflow Triggers

The CI/CD workflow is triggered by the following events:
- Push to the `main` branch
- Creation of a new tag (for releases)
- Pull requests to the `main` branch (for testing)

### Workflow Files

The workflow configurations are stored in the `.github/workflows/` directory:

- `main-publish.yml`: Main workflow for building and publishing the extension
- `pr-validation.yml`: Workflow for validating pull requests

## Workflow Configuration

### Main Publishing Workflow

The `main-publish.yml` workflow performs the following steps:

1. **Checkout**: Retrieves the latest code from the repository
2. **Setup Node.js**: Configures the Node.js environment
3. **Install Dependencies**: Installs the necessary npm packages
4. **Lint**: Checks code quality
5. **Build**: Compiles the TypeScript code
6. **Package**: Creates the VSIX package for the extension
7. **Publish**: Publishes the extension to the VS Code Marketplace

```yaml
name: Publish to VS Code Marketplace

on:
  push:
    branches: [main]
  release:
    types: [created]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v1
        with:
          node-version: '20.x'
      - run: npm install
      - run: npm run lint
      - run: npm run build
      - run: npm run package
      
  publish:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v1
        with:
          node-version: '20.x'
      - run: npm install
      - run: npm run build
      - run: npm run package
      - name: Publish to VS Code Marketplace
        run: npx vsce publish -p ${{ secrets.VSCE_PAT }}
```

### PR Validation Workflow

The `pr-validation.yml` workflow runs when a pull request is created or updated:

1. **Checkout**: Retrieves the code from the pull request
2. **Setup Node.js**: Configures the Node.js environment
3. **Install Dependencies**: Installs the necessary npm packages
4. **Lint**: Checks code quality
5. **Build**: Ensures the code compiles correctly
6. **Test Packaging**: Verifies that the extension can be packaged correctly

## Release Process

The release process follows these steps:

1. **Development**: Features are developed in feature branches
2. **Pull Request**: Changes are submitted via pull request to the `dev` branch
3. **Code Review**: The PR is reviewed and approved
4. **Merge to Dev**: Approved changes are merged to the `dev` branch
5. **Testing**: The changes are tested in the `dev` branch
6. **Version Update**: The version in `package.json` is updated according to semantic versioning
7. **Merge to Main**: The `dev` branch is merged to `main`
8. **Tag Creation**: A new tag is created with the version number
9. **Automated Publishing**: The CI/CD workflow automatically publishes the extension to the VS Code Marketplace

### Version Tagging

Version tags follow semantic versioning (`vX.Y.Z`):

```bash
git tag -a v0.0.x -m "Version 0.0.x"
git push origin v0.0.x
```

## Automated Tasks

The CI/CD workflow automates the following tasks:

1. **Code Validation**: Ensures code quality through linting
2. **Building**: Compiles TypeScript code to JavaScript
3. **Packaging**: Creates the VSIX package for the extension
4. **Publishing**: Uploads the extension to the VS Code Marketplace

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
   - Verify that the code passes linting and type checking

2. **Publishing Failures**
   - Verify that the Personal Access Token (PAT) is valid and has the correct permissions
   - Check that the version in `package.json` has been incremented
   - Ensure the `publisher` field in `package.json` is correct

3. **Version Conflicts**
   - Ensure each release has a unique version number
   - Check that the version follows semantic versioning rules

### Getting Help

If you encounter issues with the CI/CD workflow:

1. Check the GitHub Actions logs for detailed error messages
2. Review the [VS Code Extension Publishing documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
3. Submit an issue through our [issue tracker](https://github.com/andaoai/yolo-label-vs/issues)

---

This documentation is maintained by the YOLO Label VS development team. For questions or suggestions, please create an issue in the repository. 