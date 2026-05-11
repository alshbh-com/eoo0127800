import { useEffect, useState } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface N { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<N[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
      if (data) setItems(data as unknown as N[]);
    };
    load();
    const ch = supabase.channel(`notif-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [user]);

  const unread = items.filter((n) => !n.read_at).length;

  const markAll = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  };
  const handleClick = async (n: N) => {
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    setOpen(false);
    if (n.link) {
      try {
        const url = n.link.startsWith("http") ? new URL(n.link).pathname + new URL(n.link).search : n.link;
        navigate({ to: url });
      } catch {
        navigate({ to: n.link });
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <div className="text-sm font-semibold">الإشعارات</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAll}>
              <CheckCheck className="ml-1 h-3 w-3" /> قراءة الكل
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">لا توجد إشعارات</div>
          ) : items.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`flex w-full flex-col gap-0.5 border-b p-3 text-right text-sm transition-colors hover:bg-accent/50 ${
                n.read_at ? "" : "bg-primary/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{n.title}</span>
                {!n.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                {n.read_at && <Check className="h-3 w-3 text-muted-foreground" />}
              </div>
              {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
              <div className="text-[10px] text-muted-foreground" dir="ltr">{new Date(n.created_at).toLocaleString()}</div>
            </button>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
