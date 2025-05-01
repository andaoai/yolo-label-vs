# VS Code 插件发布指南

## 准备工作

1. 注册 Azure DevOps 账号
   - 访问 https://dev.azure.com/
   - 使用 Microsoft 账号登录或注册新账号

2. 创建发布者账号
   - 访问 https://marketplace.visualstudio.com/manage/publishers/
   - 点击 "Create publisher"
   - 填写发布者信息：
     - Publisher ID（发布者ID）
     - Display name（显示名称）
     - Email（联系邮箱）

3. 创建访问令牌（Personal Access Token）
   - 登录 Azure DevOps
   - 点击右上角用户头像
   - 选择 "Security"
   - 点击 "Personal access tokens"
   - 点击 "New Token"
   - 设置：
     - Name: vscode-marketplace
     - Organization: All accessible organizations
     - Expiration: 选择合适的过期时间
     - Scopes: 选择 Marketplace 下的所有权限
       - Read
       - Acquire
       - Publish
       - Manage

## 发布步骤

1. 使用访问令牌登录
   ```bash
   vsce login <发布者ID>
   ```
   输入刚才创建的访问令牌

2. 发布插件
   ```bash
   vsce publish
   ```

## 更新插件

1. 修改 package.json 中的 version 字段，增加版本号
2. 执行发布命令：
   ```bash
   vsce publish
   ```

## 查看发布状态

1. 访问 https://marketplace.visualstudio.com/manage/publishers/
2. 选择您的发布者账号
3. 在列表中可以看到已发布的插件

## 常见问题

1. 发布失败，提示权限问题
   - 检查访问令牌是否过期
   - 确认是否选择了正确的权限范围
   - 验证发布者ID是否正确

2. 插件在市场中不可见
   - 发布后需要等待几分钟到几小时不等
   - 检查 package.json 中的 publisher 是否与发布者ID一致

3. 版本号冲突
   - 确保每次发布都更新了 version 字段
   - version 必须大于之前发布的版本

## 管理插件

1. 在市场中下架插件
   ```bash
   vsce unpublish (publisher name)/(extension name)
   ```

2. 删除特定版本
   ```bash
   vsce unpublish (publisher name)/(extension name)@(version)
   ``` 