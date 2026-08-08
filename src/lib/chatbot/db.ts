import { Pool } from "pg";

const ALLOWED_RELATIONS = ["v_chatbot_orders", "v_chatbot_invoices"];
const MAX_ROWS = 200;

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.CHATBOT_DB_URL;
    if (!connectionString) throw new Error("CHATBOT_DB_URL is not configured — add it to .env.local");
    pool = new Pool({
      connectionString,
      max: 3,
      statement_timeout: 5_000,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

/**
 * Defense-in-depth on top of the database-level guarantee: the chatbot_readonly Postgres
 * role (see supabase/migrations/add_chatbot_module.sql) can only SELECT from the two allowed
 * views and nothing else — a write or an unauthorized table reference fails at the database
 * regardless of what's checked here. This validation exists to fail fast with a clear error
 * instead of relying solely on a raw Postgres permission-denied error.
 */
export function validateReadOnlySql(rawSql: string): string {
  const sql = rawSql.trim().replace(/;+\s*$/, "");
  if (!sql) throw new Error("Empty query");
  if (sql.includes(";")) throw new Error("Multiple statements are not allowed");
  if (!/^select\b/i.test(sql)) throw new Error("Only SELECT queries are allowed");

  const forbidden = /\b(insert|update|delete|drop|alter|grant|revoke|truncate|create|call|do|execute|copy|vacuum|analyze|merge|lock|comment)\b/i;
  if (forbidden.test(sql)) throw new Error("Query contains a disallowed keyword");

  const referenced = [...sql.matchAll(/\b(?:from|join)\s+"?([a-zA-Z_][\w]*)"?/gi)].map((m) => m[1].toLowerCase());
  const unknown = referenced.filter((r) => !ALLOWED_RELATIONS.includes(r));
  if (unknown.length > 0) throw new Error(`Query references a table this chatbot can't access: ${unknown.join(", ")}`);

  return sql;
}

export async function runChatbotQuery(rawSql: string): Promise<Record<string, unknown>[]> {
  const validated = validateReadOnlySql(rawSql);
  const capped = `SELECT * FROM (${validated}) AS _chatbot_sub LIMIT ${MAX_ROWS}`;

  const client = await getPool().connect();
  try {
    const result = await client.query(capped);
    return result.rows;
  } finally {
    client.release();
  }
}
