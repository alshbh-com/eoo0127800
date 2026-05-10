import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessagesSquare } from "lucide-react";

const ROLE_AR: Record<string, string> = { admin: "مسؤول", restaurant: "مطعم", driver: "مندوب" };

interface Contact { user_id: string; full_name: string; role: string }
interface Message { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null }

export function ChatPanel() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [active, setActive] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const scroll = useRef<HTMLDivElement>(null);

  // Load contacts
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

  // Realtime: incoming messages
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
            // Browser notification
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification("رسالة جديدة", { body: m.body.slice(0, 80) });
            }
          }
        })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [user, active]);

  // Load conversation when active changes
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
      // mark read
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
    <Card className="flex h-[520px] overflow-hidden p-0">
      {/* Sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-l border-border bg-sidebar">
        <div className="flex items-center gap-2 border-b border-border p-3 text-sm font-semibold">
          <MessagesSquare className="h-4 w-4 text-primary" />
          المحادثات
          {totalUnread > 0 && <span className="mr-auto rounded-full bg-destructive px-2 py-0.5 text-[10px] text-destructive-foreground">{totalUnread}</span>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 && <div className="p-4 text-xs text-muted-foreground">لا توجد جهات اتصال متاحة</div>}
          {contacts.map((c) => {
            const isActive = active?.user_id === c.user_id;
            const u = unread[c.user_id] ?? 0;
            return (
              <button
                key={c.user_id}
                onClick={() => setActive(c)}
                className={`flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-right text-sm transition-colors ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/50"}`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {(c.full_name || "?").slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.full_name || "—"}</div>
                  <div className="text-[10px] text-muted-foreground">{ROLE_AR[c.role] ?? c.role}</div>
                </div>
                {u > 0 && <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground">{u}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex flex-1 flex-col">
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">اختر محادثة للبدء</div>
        ) : (
          <>
            <div className="border-b border-border p-3 text-sm">
              <div className="font-semibold">{active.full_name}</div>
              <div className="text-[10px] text-muted-foreground">{ROLE_AR[active.role] ?? active.role}</div>
            </div>
            <div ref={scroll} className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-4">
              {messages.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                      <div>{m.body}</div>
                      <div className={`mt-0.5 text-[9px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {new Date(m.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && <div className="py-8 text-center text-xs text-muted-foreground">لا توجد رسائل بعد</div>}
            </div>
            <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالة…" />
              <Button type="submit" size="icon" disabled={!text.trim()}><Send className="h-4 w-4" /></Button>
            </form>
          </>
        )}
      </div>
    </Card>
  );
}
