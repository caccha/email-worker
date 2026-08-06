import type { Env, ParsedEmail } from "./types";
import { parseRawEmail, saveEmail, getAliases, getForwards, fetchWebhook } from "./helpers";

export default {
  async email(message: { mailFrom: string; rcptTo: string; headers: { get: (n: string) => string | null }; raw: string; accept: () => void }, env: Env): Promise<void> {
    const parsed = parseRawEmail(message.raw);
    const messageId = message.headers.get("message-id") || `msg-${Date.now()}`;
    parsed.messageId = messageId;

    // 保存到 D1
    const emailId = await saveEmail(env, parsed);
    console.log(`📥 邮件已保存: ID=${emailId}, from=${parsed.from}, to=${parsed.to}, subject=${parsed.subject}`);

    // 查找别名
    const aliases = await getAliases(env);
    const alias = aliases.find(a => message.rcptTo.endsWith(`@${a.alias}`));
    if (alias) {
      console.log(`📬 别名映射: ${message.rcptTo} -> ${alias.target_email}`);
    }

    // 匹配转发规则并触发 webhook
    const forwards = await getForwards(env);
    for (const fwd of forwards) {
      try {
        const regex = new RegExp(fwd.pattern);
        if (regex.test(message.rcptTo) || regex.test(parsed.subject)) {
          const webhookPayload = {
            emailId,
            from: parsed.from,
            to: parsed.to,
            subject: parsed.subject,
            text: parsed.text.substring(0, 2000),
            html: parsed.html.substring(0, 5000),
            receivedAt: new Date().toISOString(),
            matchedPattern: fwd.pattern,
          };
          const ok = await fetchWebhook(fwd.target_url, webhookPayload);
          console.log(`🔗 Webhook ${ok ? "成功" : "失败"}: ${fwd.target_url}`);
        }
      } catch (e) {
        console.error(`转发规则匹配失败: ${fwd.pattern}`, e);
      }
    }

    message.accept();
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // GET /api/emails - 列出邮件（支持搜索）
    if (pathname === "/api/emails" && request.method === "GET") {
      try {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "20") || 20, 100);
        const search = url.searchParams.get("search") || "";

        let result;
        if (search) {
          const like = `%${search}%`;
          result = await env.DB.prepare(
            `SELECT * FROM emails WHERE subject LIKE ? OR from_addr LIKE ? OR text_body LIKE ? ORDER BY received_at DESC LIMIT ?`
          ).bind(like, like, like, limit).all();
        } else {
          result = await env.DB.prepare(
            `SELECT * FROM emails ORDER BY received_at DESC LIMIT ?`
          ).bind(limit).all();
        }
        return Response.json({ success: true, data: result.results });
      } catch (err) {
        return Response.json({ success: false, error: String(err) }, { status: 500 });
      }
    }

    // GET /api/emails/:id - 获取单封邮件
    const emailIdMatch = pathname.match(/^\/api\/emails\/(\d+)$/);
    if (emailIdMatch && request.method === "GET") {
      const id = parseInt(emailIdMatch[1]);
      const result = await env.DB.prepare(
        `SELECT * FROM emails WHERE id = ?`
      ).bind(id).first();
      if (!result) return new Response(JSON.stringify({ error: "邮件不存在" }), { status: 404 });
      return Response.json({ success: true, data: result });
    }

    // DELETE /api/emails/:id - 删除邮件
    if (emailIdMatch && request.method === "DELETE") {
      const id = parseInt(emailIdMatch[1]);
      await env.DB.prepare(`DELETE FROM emails WHERE id = ?`).bind(id).run();
      return Response.json({ success: true });
    }

    // GET /api/aliases - 获取别名列表
    if (pathname === "/api/aliases" && request.method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM aliases").all();
      return Response.json({ success: true, data: result.results });
    }

    // POST /api/aliases - 添加别名
    if (pathname === "/api/aliases" && request.method === "POST") {
      const { alias, target_email }: { alias: string; target_email: string } = await request.json();
      if (!alias || !target_email) {
        return new Response(JSON.stringify({ error: "alias 和 target_email 为必填项" }), { status: 400 });
      }
      await env.DB.prepare(
        `INSERT INTO aliases (alias, target_email) VALUES (?, ?)`
      ).bind(alias, target_email).run();
      return Response.json({ success: true });
    }

    // DELETE /api/aliases/:id - 删除别名
    const aliasIdMatch = pathname.match(/^\/api\/aliases\/(\d+)$/);
    if (aliasIdMatch && request.method === "DELETE") {
      const id = parseInt(aliasIdMatch[1]);
      await env.DB.prepare(`DELETE FROM aliases WHERE id = ?`).bind(id).run();
      return Response.json({ success: true });
    }

    // GET /api/forwards - 获取转发规则
    if (pathname === "/api/forwards" && request.method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM forwards").all();
      return Response.json({ success: true, data: result.results });
    }

    // POST /api/forwards - 添加转发规则
    if (pathname === "/api/forwards" && request.method === "POST") {
      const { pattern, target_url }: { pattern: string; target_url: string } = await request.json();
      if (!pattern || !target_url) {
        return new Response(JSON.stringify({ error: "pattern 和 target_url 为必填项" }), { status: 400 });
      }
      await env.DB.prepare(
        `INSERT INTO forwards (pattern, target_url) VALUES (?, ?)`
      ).bind(pattern, target_url).run();
      return Response.json({ success: true });
    }

    // DELETE /api/forwards/:id - 删除转发规则
    const forwardIdMatch = pathname.match(/^\/api\/forwards\/(\d+)$/);
    if (forwardIdMatch && request.method === "DELETE") {
      const id = parseInt(forwardIdMatch[1]);
      await env.DB.prepare(`DELETE FROM forwards WHERE id = ?`).bind(id).run();
      return Response.json({ success: true });
    }

    // 返回 404
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  },
};
