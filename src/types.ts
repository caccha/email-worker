import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
}

export interface EmailHeaders {
  get(name: string): string | null;
}

export interface ParsedEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
}

export interface Alias {
  id: number;
  alias: string;
  target_email: string;
}

export interface ForwardRule {
  id: number;
  pattern: string;
  target_url: string;
}
