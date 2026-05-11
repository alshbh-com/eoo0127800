import { createFileRoute } from "@tanstack/react-router";

// Public endpoint called by Postgres trigger (pg_net) when a new notification row is inserted.
// Sends an OneSignal push to the target user (identified by Supabase user id as external_id).
export const Route = createFileRoute("/api/public/notify-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-webhook-secret");
        const expected = process.env.ONESIGNAL_WEBHOOK_SECRET;
        if (!expected || secret !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const apiKey = process.env.ONESIGNAL_REST_API_KEY;
        const appId = "13096a2e-b5f2-4d42-a446-02b83d93bbc5";
        if (!apiKey) return new Response("Missing OneSignal key", { status: 500 });

        let body: { user_id?: string; title?: string; body?: string; link?: string } = {};
        try { body = await request.json(); } catch { /* ignore */ }
        if (!body.user_id || !body.title) {
          return new Response("Bad request", { status: 400 });
        }

        const res = await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Key ${apiKey}`,
          },
          body: JSON.stringify({
            app_id: appId,
            include_aliases: { external_id: [body.user_id] },
            target_channel: "push",
            headings: { ar: body.title, en: body.title },
            contents: { ar: body.body ?? "", en: body.body ?? "" },
            url: body.link ?? undefined,
          }),
        });
        const text = await res.text();
        return new Response(text, { status: res.ok ? 200 : 502 });
      },
    },
  },
});
