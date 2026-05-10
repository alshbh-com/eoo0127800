import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { STATUS_AR, STATUS_COLORS } from "@/lib/i18n";
import { Phone, MapPin, Clock, FileText } from "lucide-react";

interface Order {
  id: string; order_number: string; customer_name: string; customer_phone: string;
  customer_address: string; items_total: number; delivery_price: number; total: number;
  status: string; notes: string | null; created_at: string; delivered_at: string | null;
}
interface History { id: string; status: string; created_at: string }

export function OrderDetailsDialog({ orderId, open, onOpenChange }: { orderId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<History[]>([]);

  useEffect(() => {
    if (!orderId || !open) return;
    const load = async () => {
      const [o, h] = await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId).maybeSingle(),
        supabase.from("order_status_history").select("*").eq("order_id", orderId).order("created_at", { ascending: true }),
      ]);
      if (o.data) setOrder(o.data as Order);
      if (h.data) setHistory(h.data as History[]);
    };
    load();
  }, [orderId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle dir="ltr" className="text-right">{order?.order_number ?? "تفاصيل الطلب"}</DialogTitle>
        </DialogHeader>
        {order && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge className={STATUS_COLORS[order.status]}>{STATUS_AR[order.status] ?? order.status}</Badge>
              <span className="text-xs text-muted-foreground" dir="ltr">{new Date(order.created_at).toLocaleString()}</span>
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2"><span className="font-semibold">{order.customer_name}</span></div>
              <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /><span dir="ltr">{order.customer_phone}</span></div>
              <div className="flex items-start gap-2 text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{order.customer_address}</span></div>
              {order.notes && <div className="flex items-start gap-2 text-muted-foreground"><FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{order.notes}</span></div>}
            </div>
            <Separator />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/40 p-2">
                <div className="text-[10px] text-muted-foreground">الطلبات</div>
                <div className="font-semibold">{Number(order.items_total).toFixed(2)}</div>
              </div>
              <div className="rounded-lg bg-muted/40 p-2">
                <div className="text-[10px] text-muted-foreground">التوصيل</div>
                <div className="font-semibold">{Number(order.delivery_price).toFixed(2)}</div>
              </div>
              <div className="rounded-lg bg-primary/10 p-2">
                <div className="text-[10px] text-muted-foreground">الإجمالي</div>
                <div className="font-semibold text-primary">{Number(order.total).toFixed(2)}</div>
              </div>
            </div>
            <Separator />
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Clock className="h-3 w-3" />سجل الحالات</div>
              <div className="space-y-2">
                {history.length === 0 && <div className="text-xs text-muted-foreground">لا يوجد سجل</div>}
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-md border p-2">
                    <Badge variant="outline" className={STATUS_COLORS[h.status]}>{STATUS_AR[h.status] ?? h.status}</Badge>
                    <span className="text-[11px] text-muted-foreground" dir="ltr">{new Date(h.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
