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

  if (!messageId) messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  if (!subject) subject = "(无主题)";

  const body = lines.slice(headersEnd).join("\r\n");
  const { text, html } = extractParts(body);

  return { from, to, subject, text, html, messageId };
}

function extractParts(body: string): { text: string; html: string } {
  const boundaryMatch = body.match(/boundary=["']?([^"'\r\n;]+)/i);
  const boundary = boundaryMatch ? boundaryMatch[1] : `--boundary`;

  const parts = body.split(boundary);
  let text = "", html = "";

  for (let i = 1; i < parts.length - 1; i++) {
    const part = parts[i];
    const headers = part.split("\r\n\r\n")[0] || part.split("\n\n")[0];
    const content = part.replace(headers, "").replace(/^\r?\n/, "");

    if (headers.includes("text/plain")) {
      text = content.trim();
    } else if (headers.includes("text/html")) {
      html = content.trim();
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
  return (result.results ?? []) as Alias[];
}

export async function getForwards(env: Env): Promise<ForwardRule[]> {
  const result = await env.DB.prepare("SELECT id, pattern, target_url FROM forwards").all();
  return (result.results ?? []) as ForwardRule[];
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
