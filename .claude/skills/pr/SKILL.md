---
name: pr
description: 创建 PR 并自动生成描述。用法: /pr [目标分支]（默认 main）
argument-hint: "[target-branch]"
disable-model-invocation: true
allowed-tools: Bash(git *) gh
---

# 创建 Pull Request

根据当前分支与目标分支的差异，生成结构化 PR 描述并创建 PR。

## 当前状态

```!
git branch --show-current
git log --oneline ${1:-main}..HEAD
git diff --stat ${1:-main}..HEAD
```

## 步骤

1. 用上面的 commits 和 diff 信息，生成 PR 描述（中文），结构：
   - **Summary**: 3-5 条要点
   - **Changes**: 按模块分组，列出关键文件
   - **Test Plan**: 验证清单

2. PR 标题格式：`<type>: <简要描述>`，type 从 commits 推断

3. 创建 PR：`gh pr create --base ${1:-main} --head <当前分支> --title <标题> --body <描述>`
   - 若 `gh` 不在 PATH，尝试：`"/c/Program Files/GitHub CLI/gh.exe" pr create ...`

4. 输出 PR 链接
