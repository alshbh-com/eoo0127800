import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function phoneToEmail(p: string) {
  return `${p.replace(/\D+/g, "")}@or.app`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });

    const { data: existing } = await admin.from("user_roles").select("id").eq("role", "admin").limit(1);
    if (existing && existing.length > 0) {
      return json({ error: "Admin already exists" }, 403);
    }

    const body = (await req.json()) as { phone: string; password: string; full_name?: string };
    if (!body.phone || !body.password) return json({ error: "Missing fields" }, 400);

    const phoneDigits = body.phone.replace(/\D+/g, "");
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: phoneToEmail(phoneDigits),
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name ?? "Admin", phone: phoneDigits },
    });
    if (createErr || !created.user) return json({ error: createErr?.message ?? "Create failed" }, 400);

    await admin.from("user_roles").insert({ user_id: created.user.id, role: "admin" });
    return json({ ok: true, user_id: created.user.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
