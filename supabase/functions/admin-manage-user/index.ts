import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function phoneToEmail(p: string) { return `${p.replace(/\D+/g, "")}@or.app`; }
function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized", detail: "Missing authorization header" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: u, error: uerr } = await caller.auth.getUser();
    if (uerr || !u.user) return json({ error: "Unauthorized", detail: uerr?.message }, 401);
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    if (!roleRows?.some((r) => r.role === "admin")) return json({ error: "Forbidden" }, 403);

    const body = await req.json();
    const action = body.action as string;

    if (action === "reset_password") {
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "delete") {
      const { error } = await admin.auth.admin.deleteUser(body.user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "toggle_active") {
      const table = body.table as "restaurants" | "drivers" | "profiles";
      const { error } = await admin.from(table).update({ is_active: body.is_active }).eq("id", body.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "update_phone") {
      const phoneDigits = String(body.phone).replace(/\D+/g, "");
      const { error: e1 } = await admin.auth.admin.updateUserById(body.user_id, {
        email: phoneToEmail(phoneDigits),
        user_metadata: { phone: phoneDigits },
      });
      if (e1) return json({ error: e1.message }, 400);
      await admin.from("profiles").update({ phone: phoneDigits }).eq("id", body.user_id);
      return json({ ok: true });
    }

    if (action === "update_role") {
      await admin.from("user_roles").delete().eq("user_id", body.user_id);
      await admin.from("user_roles").insert({ user_id: body.user_id, role: body.role });
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Error" }, 500);
  }
});
