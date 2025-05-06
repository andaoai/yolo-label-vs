# YOLO Label VS Development Guide

## Table of Contents
1. [Setup Environment](#setup-environment)
2. [Repository Structure](#repository-structure)
3. [Branch Management Strategy](#branch-management-strategy)
4. [Development Workflow](#development-workflow)
5. [Code Submission](#code-submission)
6. [Pull Request Process](#pull-request-process)
7. [Version Management](#version-management)
8. [Issue Reporting](#issue-reporting)
9. [Documentation Maintenance](#documentation-maintenance)
10. [FAQ](#faq)

## Setup Environment

### Prerequisites
- Node.js ≥ 20.0.0
- VSCode ≥ 1.85.0
- Git

### Steps
1. **Clone Repository**
   ```bash
   git clone https://github.com/andaoai/yolo-label-vs.git
   cd yolo-label-vs
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Prepare Development Environment**
   ```bash
   npm run prepare
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Debug in VSCode**
   - Press F5 to launch extension debugging
   - Or use the "Run and Debug" panel, select "Launch Extension"

## Repository Structure

```
yolo-label-vs/
├── .github/                  # GitHub related configurations
├── .vscode/                  # VSCode configurations
├── docs/                     # Documentation
│   ├── images/               # Images used in documentation
│   ├── README_CN.md          # Chinese documentation
│   └── ...                   # Other documentation files
├── node_modules/             # Dependencies (gitignore)
├── src/                      # Source code
│   ├── YoloDataReader.ts     # YOLO data reader
│   └── ...                   # Other source files
├── test_label/               # Test data
├── .gitignore                # Git ignore configuration
├── package.json              # Project configuration
├── README.md                 # English documentation
└── tsconfig.json             # TypeScript configuration
```

## Branch Management Strategy

We follow this branch strategy:

- **main**: Stable version branch for releases
- **dev**: Development branch, all feature development is based on this branch
- **feature/xxx**: Feature development branches
- **bugfix/xxx**: Bug fix branches
- **docs/xxx**: Documentation update branches

## Development Workflow

1. **Create Feature Branch**
   - Create new feature branch from `dev` branch
   ```bash
   git checkout dev
   git pull
   git checkout -b feature/your-feature-name
   ```

2. **Local Development**
   - Write code
   - Perform testing
   - Ensure code meets project standards

3. **Commit Changes**
   - Ensure code passes checks before committing
   ```bash
   npm run lint
   ```

4. **Push Branch**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create Pull Request**
   - From feature branch to `dev` branch

## Code Submission

### Commit Message Standards

We use the following format:

```
<type>: <brief description>

<detailed description>
```

Types include:
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code formatting changes
- **refactor**: Code refactoring
- **test**: Adding or modifying tests
- **chore**: Build process or auxiliary tool changes

Example:
```
feat: add COCO8-seg data format support

- Implement COCO8-seg format parsing
- Add related test cases
- Update documentation
```

## Pull Request Process

1. **Create PR**
   - Login to GitHub, go to the project repository
   - Click "Pull requests" > "New pull request"
   - Select base branch (`dev`) and your feature branch
   - Click "Create pull request"

2. **Fill PR Information**
   - Provide clear title and description
   - List major changes
   - Reference related issues (if any)

3. **Wait for Review**
   - At least one maintainer needs to review
   - Resolve issues raised during review

4. **Merge PR**
   - After passing all reviews, PR can be merged
   - Feature branch can be deleted after merging

## Version Management

We use [Semantic Versioning](https://semver.org/):

- **Major version**: Incompatible API changes
- **Minor version**: Backward-compatible functionality additions
- **Patch version**: Backward-compatible bug fixes

Version update process:
1. Complete feature development and testing in `dev` branch
2. Update version number in `package.json`
3. Update CHANGELOG or release notes
4. Merge to `main` branch
5. Tag release version
   ```bash
   git tag -a v0.0.x -m "Version 0.0.x"
   git push origin v0.0.x
   ```

## Issue Reporting

### Submitting Issues

1. Visit the [Issues page](https://github.com/andaoai/yolo-label-vs/issues)
2. Click "New issue"
3. Select appropriate issue template
4. Fill necessary information:
   - Environment details
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots or logs (if available)

### Issue Lifecycle

- **open**: Newly submitted or in-process issues
- **in progress**: Developer is working on the solution
- **need more info**: More information required from submitter
- **closed**: Resolved or invalid

## Documentation Maintenance

- All feature changes should update both English (README.md) and Chinese (docs/README_CN.md) documentation
- Documentation updates should maintain consistent formatting
- Image resources should be placed in the `docs/images/` directory
- Independent `docs/xxx` branches can be used for large documentation updates

## FAQ

### Q: How to debug the extension?
A: Press F5 to launch a new VSCode window that loads the extension under development.

### Q: Where should test data be placed?
A: Place test data in the `test_label/` directory, which has been configured with example data.

### Q: How to handle conflicts?
A: 
```bash
git fetch origin
git merge origin/dev
# Resolve conflicts
git add .
git commit -m "resolve conflicts"
```

### Q: What if my local branch is out of sync with remote?
A:
```bash
git fetch origin
git reset --hard origin/dev  # Use with caution, will lose local changes
# Or
git stash
git pull origin dev
git stash pop  # May need to resolve conflicts
```

### Q: What is the CI/CD process?
A: The project uses GitHub Actions for CI/CD. Each commit to the `main` branch automatically publishes to the VS Code Marketplace. See configuration files in the `.github/workflows/` directory for details.

---

Contributions are welcome. If you have any questions, please submit them through [Issues](https://github.com/andaoai/yolo-label-vs/issues) or contact us via email. 