# 部署清单

## 前置条件
- [ ] Cloudflare 账号
- [ ] 已验证的域名
- [ ] Node.js 18+ 和 npm
- [ ] Wrangler CLI 安装 (`npm install -g wrangler`)

## 步骤

1. **创建 D1 数据库**
   - Dashboard → D1 → Create Database → 名称 `email-db`
   - 复制 Database ID

2. **修改 wrangler.toml**
   ```
   database_id = "你的-d1-database-id"
   ```

3. **执行迁移**
   ```bash
   npx wrangler d1 execute email-db --remote --file=database/schema.sql
   ```

4. **部署 Worker**
   ```bash
   npx wrangler deploy
   ```

5. **配置 DNS MX 记录**
   ```
   @ MX 10 mx.cloudflare.com
   ```

6. **配置 Email Routing**
   - Dashboard → Email → Routes
   - Catch-all: `*@yourdomain.com` → `your-worker.workers.dev`

7. **添加别名**
   ```bash
   curl -X POST https://your-worker.workers.dev/api/aliases \
     -H "Content-Type: application/json" \
     -d '{"alias": "yourdomain.com", "target_email": "your@gmail.com"}'
   ```
