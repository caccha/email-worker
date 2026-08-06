import type { Env, ParsedEmail, Alias, ForwardRule } from "./types";

/**
 * 解析原始邮件，提取 from/to/subject/body
 */
export function parseRawEmail(raw: string): ParsedEmail {
  // 统一换行符为 \n
  const normalized = raw.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  // 找到 headers 和 body 的分界（第一个空行）
  let headersEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") {
      headersEnd = i;
      break;
    }
  }

  const headerText = lines.slice(0, headersEnd).join("\n");
  const body = lines.slice(headersEnd + 1).join("\n");

  // 解析 headers（处理折叠行：以空格/tab 开头的续行）
  const headers = parseHeaders(headerText);
  const from = headers["from"] || "";
  const to = headers["to"] || "";
  const subject = headers["subject"] || "";
  const messageId = headers["message-id"] || "";
  const contentType = headers["content-type"] || "";

  const finalMessageId = messageId || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const finalSubject = subject || "(无主题)";

  const { text, html } = extractParts(body, contentType);

  return { from, to, subject: finalSubject, text, html, messageId: finalMessageId };
}

/**
 * 解析邮件 headers，支持折叠行（以空格/tab 开头的续行）
 */
function parseHeaders(headerText: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = headerText.split("\n");
  let currentKey = "";
  let currentValue = "";

  for (const line of lines) {
    // 折叠行：以空格或 tab 开头，追加到上一个 header 的值
    if (line.startsWith(" ") || line.startsWith("\t")) {
      currentValue += " " + line.trim();
    } else {
      // 保存上一个 header
      if (currentKey) {
        result[currentKey.toLowerCase()] = currentValue.trim();
      }
      // 开始新 header
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        currentKey = line.substring(0, colonIdx).trim();
        currentValue = line.substring(colonIdx + 1).trim();
      }
    }
  }
  // 保存最后一个
  if (currentKey) {
    result[currentKey.toLowerCase()] = currentValue.trim();
  }
  return result;
}

/**
 * 从 Content-Type 中提取 boundary
 */
function extractBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=["']?([^"';\s]+)["']?/i);
  return match ? match[1] : null;
}

/**
 * 解码内容
 */
function decodeContent(body: string, encoding: string): string {
  const enc = encoding.toLowerCase().trim();
  if (enc === "base64") {
    try {
      const clean = body.replace(/[\r\n\s]/g, "");
      const decoded = atob(clean);
      // 尝试 UTF-8 解码
      try {
        return new TextDecoder("utf-8").decode(Uint8Array.from(decoded, c => c.charCodeAt(0)));
      } catch {
        return decoded;
      }
    } catch {
      return body;
    }
  }
  if (enc === "quoted-printable") {
    return decodeQuotedPrintable(body);
  }
  return body;
}

/**
 * 解码 quoted-printable 编码
 */
function decodeQuotedPrintable(body: string): string {
  // 先处理软换行（行尾 = 号）
  const unfolded = body.replace(/=\r?\n/g, "");
  // 解码 =XX 十六进制
  return unfolded.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

/**
 * 从邮件 body 中提取 text 和 html 部分
 */
function extractParts(body: string, contentType: string): { text: string; html: string } {
  const boundary = extractBoundary(contentType);

  if (!boundary) {
    // 非 multipart 邮件
    // 检查 body 是否本身就有 Content-Type header（有些邮件 body 第一部分是 headers）
    const encMatch = body.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const encoding = encMatch ? encMatch[1] : "";

    // 去掉可能存在的 part headers
    const headerEnd = body.indexOf("\n\n");
    let content = body;
    if (headerEnd >= 0 && body.substring(0, headerEnd).match(/Content-Type:/i)) {
      content = body.substring(headerEnd + 2);
    }

    if (contentType.includes("text/html") || content.match(/<html/i)) {
      return { text: "", html: decodeContent(content.trim(), encoding) };
    }
    return { text: decodeContent(content.trim(), encoding), html: "" };
  }

  // Multipart 邮件：按 boundary 分割
  const sep = "--" + boundary;
  const parts = body.split(sep);

  let text = "";
  let html = "";

  for (let i = 1; i < parts.length; i++) {
    let part = parts[i];

    // 跳过结尾标记
    if (part.startsWith("--")) continue;

    // 去掉 part 开头的换行符
    part = part.replace(/^\r?\n/, "");

    // 分离 part headers 和 content
    const partHeaderEnd = part.indexOf("\n\n");
    if (partHeaderEnd < 0) continue;

    const partHeaders = part.substring(0, partHeaderEnd).toLowerCase();
    let content = part.substring(partHeaderEnd + 2);

    // 去掉末尾的换行符和 boundary 残留
    content = content.replace(/\r?\n$/, "").trim();

    // 嵌套 multipart
    const nestedBoundary = extractBoundary(partHeaders);
    if (nestedBoundary || partHeaders.includes("multipart/")) {
      const nested = extractParts(content, partHeaders);
      if (nested.html && !html) html = nested.html;
      if (nested.text && !text) text = nested.text;
      continue;
    }

    // 获取编码方式
    const encMatch = partHeaders.match(/content-transfer-encoding:\s*(\S+)/i);
    const encoding = encMatch ? encMatch[1] : "";

    const decoded = decodeContent(content, encoding);

    if (partHeaders.includes("text/html") && !html) {
      html = decoded;
    } else if (partHeaders.includes("text/plain") && !text) {
      text = decoded;
    }
  }

  if (!text && !html) {
    text = body.trim();
  }

  return { text, html };
}

/**
 * 保存邮件到 D1
 */
export async function saveEmail(env: Env, data: ParsedEmail): Promise<number> {
  const stmt = env.DB.prepare(
    `INSERT INTO emails (message_id, from_addr, to_addr, subject, text_body, html_body) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const result = await stmt
    .bind(data.messageId, data.from, data.to, data.subject, data.text, data.html)
    .run();
  return (result.meta?.last_row_id ?? 0) as number;
}

/**
 * 获取所有别名
 */
export async function getAliases(env: Env): Promise<Alias[]> {
  const result = await env.DB.prepare("SELECT id, alias, target_email FROM aliases").all();
  return (result.results ?? []) as unknown as Alias[];
}

/**
 * 获取所有转发规则
 */
export async function getForwards(env: Env): Promise<ForwardRule[]> {
  const result = await env.DB.prepare("SELECT id, pattern, target_url FROM forwards").all();
  return (result.results ?? []) as unknown as ForwardRule[];
}

/**
 * 发送 webhook
 */
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
