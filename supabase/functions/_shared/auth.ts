import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type AuthedContext = {
  userId: string;
  admin: SupabaseClient;
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Resolves the calling user from the request's JWT and returns a
 * service-role client for quota bookkeeping. Returns a Response on failure.
 */
export async function requireUser(req: Request): Promise<AuthedContext | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  return { userId: data.user.id, admin };
}

/** Consumes quota units; returns remaining, or a 402 Response when exhausted. */
export async function consumeUnits(
  ctx: AuthedContext,
  units: number,
): Promise<number | Response> {
  const { data, error } = await ctx.admin.rpc("consume_units", {
    p_user: ctx.userId,
    p_units: units,
  });
  if (error) return json({ error: "quota_check_failed", detail: error.message }, 500);
  if (typeof data !== "number" || data < 0) {
    return json({ error: "quota_exhausted" }, 402);
  }
  return data;
}

/** Read-only quota check (for calls that shouldn't consume units). */
export async function requireRemaining(ctx: AuthedContext): Promise<Response | null> {
  const { data, error } = await ctx.admin.rpc("remaining_units", { p_user: ctx.userId });
  if (error) return json({ error: "quota_check_failed", detail: error.message }, 500);
  if (typeof data !== "number" || data <= 0) return json({ error: "quota_exhausted" }, 402);
  return null;
}

export async function logUsage(
  ctx: AuthedContext,
  kind: string,
  units: number,
  inputTokens?: number,
  outputTokens?: number,
): Promise<void> {
  await ctx.admin.from("usage_events").insert({
    user_id: ctx.userId,
    kind,
    units,
    input_tokens: inputTokens ?? null,
    output_tokens: outputTokens ?? null,
  });
}
