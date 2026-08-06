import type { Env, ParsedEmail, Alias, ForwardRule } from "./types";

export function parseRawEmail(raw: string): ParsedEmail {
  const lines = raw.split("\r\n");
  let headersEnd = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "") {
      headersEnd = i + 1;
      break;
    }
  }

  const headerLines = lines.slice(0, headersEnd);
  let from = "", to = "", subject = "", messageId = "";

  for (const line of headerLines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("from:")) from = line.replace(/^from:\s*/i, "").trim();
    else if (lower.startsWith("to:")) to = line.replace(/^to:\s*/i, "").trim();
    else if (lower.startsWith("subject:")) subject = line.replace(/^subject:\s*/i, "").trim();
    else if (lower.startsWith("message-id:")) messageId = line.replace(/^message-id:\s*/i, "").trim();
  }

  if (!messageId) messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  if (!subject) subject = "(无主题)";

  const body = lines.slice(headersEnd).join("\r\n");
  const { text, html } = extractParts(body);

  return { from, to, subject, text, html, messageId };
}

function decodeContent(body: string, encoding: string): string {
  const enc = encoding.toLowerCase().trim();
  if (enc === "base64") {
    try {
      // 清理 base64 内容中的换行符
      const clean = body.replace(/[\r\n\s]/g, "");
      const decoded = atob(clean);
      return decoded;
    } catch {
      return body;
    }
  }
  return body;
}

function extractParts(body: string): { text: string; html: string } {
  // 尝试匹配 multipart boundary
  const boundaryMatch = body.match(/boundary="([^"]+)"/i) || body.match(/boundary=([^\r\n;]+)/i);
  if (!boundaryMatch) {
    // 非 multipart，检查 Content-Transfer-Encoding
    const encMatch = body.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const encoding = encMatch ? encMatch[1] : "";
    const headerEnd = body.indexOf("\r\n\r\n");
    const content = headerEnd >= 0 ? body.substring(headerEnd + 4) : body;
    if (body.match(/<html/i)) {
      return { text: "", html: decodeContent(content.trim(), encoding) };
    }
    return { text: decodeContent(content.trim(), encoding), html: "" };
  }

  const boundary = boundaryMatch[1].trim();
  const parts = body.split("--" + boundary);
  let text = "", html = "";

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    // 跳过结尾标记 --boundary--
    if (part.trim() === "--" || part.trim() === "") continue;

    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;

    const headerSection = part.substring(0, headerEnd);
    let content = part.substring(headerEnd + 4);

    // 处理嵌套 multipart（如 multipart/alternative 嵌入 multipart/mixed）
    if (headerSection.includes("multipart/")) {
      const nested = extractParts(content);
      if (nested.html) html = nested.html;
      if (nested.text) text = nested.text;
      continue;
    }

    // 获取 Content-Transfer-Encoding
    const encMatch = headerSection.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const encoding = encMatch ? encMatch[1] : "";

    // 去除末尾的 boundary 分隔符残留
    content = content.replace(/\r?\n--\r?\n?$/, "").trim();
    const decoded = decodeContent(content, encoding);

    if (headerSection.includes("text/html")) {
      html = decoded;
    } else if (headerSection.includes("text/plain")) {
      text = decoded;
    }
  }

  if (!text && !html) {
    text = body.trim();
  }

  return { text, html };
}

export async function saveEmail(env: Env, data: ParsedEmail): Promise<number> {
  const stmt = env.DB.prepare(
    `INSERT INTO emails (message_id, from_addr, to_addr, subject, text_body, html_body) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const result = await stmt
    .bind(data.messageId, data.from, data.to, data.subject, data.text, data.html)
    .run();
  return (result.meta?.last_row_id ?? 0) as number;
}

export async function getAliases(env: Env): Promise<Alias[]> {
  const result = await env.DB.prepare("SELECT id, alias, target_email FROM aliases").all();
  return (result.results ?? []) as unknown as Alias[];
}

export async function getForwards(env: Env): Promise<ForwardRule[]> {
  const result = await env.DB.prepare("SELECT id, pattern, target_url FROM forwards").all();
  return (result.results ?? []) as unknown as ForwardRule[];
}

export async function fetchWebhook(url: string, payload: object): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch {
    return false;
  }
}
