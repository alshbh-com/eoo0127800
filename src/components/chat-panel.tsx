import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessagesSquare, ArrowRight } from "lucide-react";

const ROLE_AR: Record<string, string> = { admin: "مسؤول", restaurant: "مطعم", driver: "مندوب" };

interface Contact { user_id: string; full_name: string; role: string }
interface Message { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null }

export function ChatPanel({ initialContactId }: { initialContactId?: string | null } = {}) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [active, setActive] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const scroll = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.rpc("get_chat_contacts" as never);
      if (data) setContacts(data as Contact[]);
      const { data: ums } = await supabase
        .from("messages").select("sender_id").eq("recipient_id", user.id).is("read_at", null);
      if (ums) {
        const map: Record<string, number> = {};
        ums.forEach((m: { sender_id: string }) => { map[m.sender_id] = (map[m.sender_id] ?? 0) + 1; });
        setUnread(map);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!initialContactId || contacts.length === 0) return;
    const c = contacts.find((x) => x.user_id === initialContactId);
    if (c) setActive(c);
  }, [initialContactId, contacts]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`msg-in-${user.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const m = payload.new as Message;
          if (active && m.sender_id === active.user_id) {
            setMessages((prev) => [...prev, m]);
            supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
          } else {
            setUnread((u) => ({ ...u, [m.sender_id]: (u[m.sender_id] ?? 0) + 1 }));
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification("رسالة جديدة", { body: m.body.slice(0, 80) });
            }
          }
        })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [user, active]);

  useEffect(() => {
    if (!user || !active) return;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${active.user_id}),and(sender_id.eq.${active.user_id},recipient_id.eq.${user.id})`)
        .order("created_at", { ascending: true })
        .limit(200);
      if (data) setMessages(data as Message[]);
      await supabase.from("messages").update({ read_at: new Date().toISOString() })
        .eq("sender_id", active.user_id).eq("recipient_id", user.id).is("read_at", null);
      setUnread((u) => ({ ...u, [active.user_id]: 0 }));
    })();
  }, [user, active]);

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !active || !text.trim()) return;
    const body = text.trim();
    setText("");
    const { data, error } = await supabase.from("messages")
      .insert({ sender_id: user.id, recipient_id: active.user_id, body })
      .select().single();
    if (!error && data) setMessages((prev) => [...prev, data as Message]);
  };

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  return (
    <Card className="flex h-[600px] overflow-hidden p-0">
      {/* Contacts list - hidden when conversation open */}
      {!active && (
        <div className="flex w-full flex-col">
          <div className="flex items-center gap-2 border-b border-border bg-gradient-primary p-4 text-primary-foreground">
            <MessagesSquare className="h-5 w-5" />
            <span className="font-bold">المحادثات</span>
            {totalUnread > 0 && <span className="mr-auto rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">{totalUnread}</span>}
          </div>
          <div className="flex-1 overflow-y-auto">
            {contacts.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">لا توجد جهات اتصال متاحة بعد</div>}
            {contacts.map((c) => {
              const u = unread[c.user_id] ?? 0;
              return (
                <button
                  key={c.user_id}
                  onClick={() => setActive(c)}
                  className="flex w-full items-center gap-3 border-b border-border/50 p-4 text-right transition-colors hover:bg-accent"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-base font-bold text-primary-foreground shadow-soft">
                    {(c.full_name || "?").slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{c.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{ROLE_AR[c.role] ?? c.role}</div>
                  </div>
                  {u > 0 && <span className="rounded-full bg-destructive px-2 py-1 text-xs font-bold text-destructive-foreground">{u}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Conversation - fullscreen when active */}
      {active && (
        <div className="flex w-full flex-col">
          <div className="flex items-center gap-3 border-b border-border bg-gradient-primary p-3 text-primary-foreground">
            <Button variant="ghost" size="icon" onClick={() => setActive(null)} className="text-primary-foreground hover:bg-white/20">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
              {(active.full_name || "?").slice(0, 1)}
            </div>
            <div>
              <div className="font-semibold">{active.full_name}</div>
              <div className="text-xs opacity-80">{ROLE_AR[active.role] ?? active.role}</div>
            </div>
          </div>
          <div ref={scroll} className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-4">
            {messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-soft ${mine ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                    <div>{m.body}</div>
                    <div className={`mt-0.5 text-[9px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {new Date(m.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              );
            })}
            {messages.length === 0 && <div className="py-8 text-center text-xs text-muted-foreground">لا توجد رسائل بعد — ابدأ المحادثة</div>}
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-border p-3 bg-card">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالة…" />
            <Button type="submit" size="icon" disabled={!text.trim()} className="bg-gradient-primary"><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      )}
    </Card>
  );
}
