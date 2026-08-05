# 推送项目到 GitHub

## 方式一：手动创建仓库（推荐）

### 步骤

1. **在 GitHub 创建新仓库**
   - 访问 https://github.com/new
   - 仓库名称：`cf-email-worker`（或其他你喜欢的名字）
   - 设置为 Private 或 Public
   - **不要**勾选 "Add a README file"

2. **推送代码**
   ```bash
   cd email-worker
   git remote add origin https://github.com/你的用户名/cf-email-worker.git
   git branch -M main
   git push -u origin main
   ```

## 方式二：使用 GitHub CLI

如果已安装 `gh`：
```bash
gh auth login
gh repo create cf-email-worker --private --source=. --push
```

## 项目文件清单

```
email-worker/
├── .gitignore
├── DEPLOY.md              # 部署指南
├── README.md              # 项目说明
├── database/
│   └── schema.sql         # D1 数据库表结构
├── package.json
├── public/
│   ├── app.js             # 前端逻辑
│   ├── index.html         # Web UI
│   └── styles.css         # 样式
├── src/
│   ├── helpers.ts         # 邮件解析、数据库操作
│   ├── index.ts           # 主入口
│   └── types.ts           # 类型定义
├── tsconfig.json
└── wrangler.toml          # Cloudflare 配置
```
