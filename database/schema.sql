-- 邮件数据库表结构
-- 运行: wrangler d1 execute email-db --remote --file=database/schema.sql

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT,
  text_body TEXT,
  html_body TEXT,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed BOOLEAN DEFAULT 0,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_emails_to ON emails(to_addr);
CREATE INDEX IF NOT EXISTS idx_emails_received ON emails(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_subject ON emails(subject);

-- 用户别名表（映射别名到真实邮箱）
CREATE TABLE IF NOT EXISTS aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias TEXT UNIQUE NOT NULL,
  target_email TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 转发规则表
CREATE TABLE IF NOT EXISTS forwards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL,
  target_url TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 设置表
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 插入默认设置
INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '30');
