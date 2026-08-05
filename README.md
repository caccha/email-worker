# Cloudflare Email Worker + D1 邮箱服务

基于 Cloudflare Email Workers + D1 的自建邮件接收服务，带 Web UI 管理面板。

## 功能

- 📥 接收邮件并存储到 D1 SQLite 数据库
- 🏷️ 别名映射（`user@yourdomain.com` → `real@gmail.com`）
- 🔗 Webhook 转发（邮件到达时推送给外部服务）
- 📋 Web UI 管理邮件、别名、转发规则
- 📱 响应式设计，支持移动端

## 快速开始

### 1. 安装依赖

```bash
cd email-worker
npm install
```

### 2. 创建 D1 数据库

在 [Cloudflare Dashboard](https://dash.cloudflare.com) → D1 中创建数据库：
- 名称：`email-db`

获取数据库 ID，然后修改 `wrangler.toml` 中的 `database_id`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "email-db"
database_id = "你的D1_DATABASE_ID"
```

执行数据库迁移：

```bash
npx wrangler d1 execute email-db --remote --file=database/schema.sql
```

### 3. 配置 GitHub Actions (可选)

项目支持 GitHub Actions 自动部署到 Cloudflare。

**步骤：**

1. 在仓库 Settings → Secrets and variables → Actions 中添加：
   - `CLOUDFLARE_API_TOKEN`: Cloudflare API Token
   - `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID

2. 在仓库根目录创建 `.github/workflows/deploy.yml`：
```yaml
name: Deploy to Cloudflare

on:
  push:
    branches: [master, main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

3. 推送代码时会自动触发部署，或手动在 Actions 页面触发。

### 4. 部署

```bash
npx wrangler deploy
```

### 5. 配置 DNS 和 Email Routing

**DNS 设置：**
```
@ MX 10 mx.cloudflare.com
```

**Cloudflare Dashboard → Email Routing：**
1. 添加域名
2. 创建 Catch-all 规则，路由到 `你的-worker-name.workers.dev`

### 6. 使用 Web UI

部署后访问：
```
https://your-worker.workers.dev/
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/emails` | 获取邮件列表 |
| GET | `/api/emails/:id` | 获取单封邮件 |
| DELETE | `/api/emails/:id` | 删除邮件 |
| GET | `/api/aliases` | 获取别名列表 |
| POST | `/api/aliases` | 添加别名 |
| DELETE | `/api/aliases/:id` | 删除别名 |
| GET | `/api/forwards` | 获取转发规则 |
| POST | `/api/forwards` | 添加转发规则 |
| DELETE | `/api/forwards/:id` | 删除转发规则 |

### 示例

```bash
# 获取最新 10 封邮件
curl https://your-worker.workers.dev/api/emails?limit=10

# 添加别名：newsletter@yourdomain.com → your@gmail.com
curl -X POST https://your-worker.workers.dev/api/aliases \
  -H "Content-Type: application/json" \
  -d '{"alias": "yourdomain.com", "target_email": "your@gmail.com"}'

# 添加转发规则：所有邮件推送到 webhook
curl -X POST https://your-worker.workers.dev/api/forwards \
  -H "Content-Type: application/json" \
  -d '{"pattern": ".*", "target_url": "https://your-server.com/webhook"}'
```

## 架构

```
收件人@域名.com
       ↓
  Cloudflare Email Workers
       ↓
  解析邮件 (parseRawEmail)
       ↓
  存入 D1 数据库
       ↓
  匹配别名 + 触发 Webhook
```

## 限制与注意事项

- 免费版：每天最多 100,000 次 Email Worker 调用
- D1 免费版：每日 50,000 读 / 10,000 写
- 邮件仅存储文本内容，不存储附件
- 建议定期清理旧邮件

## 文件结构

```
email-worker/
├── src/
│   ├── index.ts          # 主入口，处理邮件和 API
│   ├── helpers.ts        # 邮件解析、数据库操作
│   └── types.ts          # TypeScript 类型定义
├── public/
│   ├── index.html        # Web UI
│   ├── styles.css        # 样式
│   └── app.js            # 前端逻辑
├── database/
│   └── schema.sql        # D1 数据库表结构
├── wrangler.toml         # Cloudflare Workers 配置
├── package.json
└── tsconfig.json
```
