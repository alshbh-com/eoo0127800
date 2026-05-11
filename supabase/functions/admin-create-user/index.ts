import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  phone: string;
  password: string;
  full_name: string;
  role: "restaurant" | "driver" | "admin";
  city_id?: string | null;
  name?: string;
  address?: string | null;
}

function phoneToEmail(p: string) {
  return `${p.replace(/\D+/g, "")}@or.app`;
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

    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized", detail: userErr?.message }, 401);

    const { data: roleRows } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    if (!roleRows?.some((r) => r.role === "admin")) return json({ error: "Forbidden" }, 403);

    const body = (await req.json()) as Body;
    if (!body.phone || !body.password || !body.role) return json({ error: "Missing fields" }, 400);

    const phoneDigits = body.phone.replace(/\D+/g, "");

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: phoneToEmail(phoneDigits),
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name, phone: phoneDigits },
    });
    if (createErr || !created.user) return json({ error: createErr?.message ?? "Create failed" }, 400);

    const newUserId = created.user.id;

    await admin.from("user_roles").insert({ user_id: newUserId, role: body.role });

    if (body.role === "restaurant") {
      await admin.from("restaurants").insert({
        user_id: newUserId,
        name: body.name ?? body.full_name,
        phone: phoneDigits,
        city_id: body.city_id ?? null,
        address: body.address ?? null,
      });
    } else if (body.role === "driver") {
      await admin.from("drivers").insert({
        user_id: newUserId,
        phone: phoneDigits,
        city_id: body.city_id ?? null,
      });
    }
    // role === "admin": no extra table needed

    return json({ ok: true, user_id: newUserId });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
