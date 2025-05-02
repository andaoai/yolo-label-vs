# <img src="./images/icon.svg" width="32" height="32" alt="YOLO Label Tool Icon"> Publishing Guide

## Prerequisites

1. Azure DevOps Account
   - Visit https://dev.azure.com/
   - Sign in with Microsoft account or create new one

2. Create Publisher Account
   - Visit https://marketplace.visualstudio.com/manage/publishers/
   - Click "Create publisher"
   - Fill in publisher information:
     - Publisher ID
     - Display name
     - Email

3. Create Personal Access Token (PAT)
   - Login to Azure DevOps
   - Click user avatar in top-right corner
   - Select "Security"
   - Click "Personal access tokens"
   - Click "New Token"
   - Configure:
     - Name: vscode-marketplace
     - Organization: All accessible organizations
     - Expiration: Choose appropriate duration
     - Scopes: Select all Marketplace permissions
       - Read
       - Acquire
       - Publish
       - Manage

## Automated Publishing

We have set up automated publishing to VS Code Marketplace using GitHub Actions. For detailed instructions, please see:

* [VS Code Marketplace CI Guide](./CI_CD_WORKFLOW.md)

With this setup, the extension will be automatically published whenever a new GitHub Release is created.

## Publishing Steps

1. Login with access token
   ```bash
   vsce login <publisher-id>
   ```
   Enter the Personal Access Token when prompted

2. Publish extension
   ```bash
   vsce publish
   ```

## Updating Extension

1. Modify version field in package.json to increment version number
2. Run publish command:
   ```bash
   vsce publish
   ```

## Checking Publication Status

1. Visit https://marketplace.visualstudio.com/manage/publishers/
2. Select your publisher account
3. View your published extensions in the list

## Common Issues

1. Publishing fails with permission error
   - Check if access token has expired
   - Verify correct permission scopes are selected
   - Confirm publisher ID is correct

2. Extension not visible in marketplace
   - Allow several minutes to hours for publication
   - Verify publisher in package.json matches publisher ID

3. Version conflict
   - Ensure version is incremented for each publish
   - Version must be higher than previously published

## Managing Extensions

1. Unpublish extension from marketplace
   ```bash
   vsce unpublish (publisher name)/(extension name)
   ```

2. Remove specific version
   ```bash
   vsce unpublish (publisher name)/(extension name)@(version)
   ``` 