import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout, type NavItem } from "@/components/dashboard-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LayoutDashboard, MapPin, Phone, Truck, Map as MapIcon, MessagesSquare, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { STATUS_AR, STATUS_COLORS } from "@/lib/i18n";
import { ChatPanel } from "@/components/chat-panel";
import { ComplaintsList } from "@/components/complaints";
import { DriversMap, type MapDriver } from "@/components/drivers-map";
import { useNotificationPermission, notify } from "@/lib/notifications";

export const Route = createFileRoute("/driver")({
  component: DriverPage,
});

const navItems: NavItem[] = [{ to: "/driver", label: "طلباتي", icon: LayoutDashboard }];

const NEXT_STATUS: Record<string, string[]> = {
  accepted: ["preparing", "picked_up", "cancelled"],
  preparing: ["picked_up", "cancelled"],
  picked_up: ["on_the_way"],
  on_the_way: ["delivered", "returned"],
};

interface Order {
  id: string; order_number: string; daily_number: number | null; customer_name: string; customer_phone: string;
  customer_address: string; items_total: number; delivery_price: number; total: number;
  status: string; created_at: string; notes: string | null;
}

function DriverPage() {
  const { user, loading, roles } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Truck className="h-8 w-8 animate-pulse text-primary" /></div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes("driver")) return <Navigate to="/" />;
  return (
    <DashboardLayout title="مندوب" items={navItems}>
      <Body />
    </DashboardLayout>
  );
}

function Body() {
  const { user } = useAuth();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [knownIds] = useState(new Set<string>());

  useNotificationPermission();

  const loadOrders = async (did: string, isInitial = false) => {
    const { data } = await supabase.from("orders").select("*").eq("driver_id", did).order("created_at", { ascending: false });
    if (!data) return;
    if (!isInitial) {
      data.forEach((o) => {
        if (!knownIds.has(o.id)) {
          toast.info(`طلب جديد: ${o.order_number}`);
          notify("طلب جديد على حسابك", `${o.order_number} — ${o.customer_name}`);
        }
      });
    }
    data.forEach((o) => knownIds.add(o.id));
    setOrders(data as Order[]);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: d } = await supabase.from("drivers").select("id, is_online").eq("user_id", user.id).maybeSingle();
      if (!d) return;
      setDriverId(d.id); setIsOnline(d.is_online);
      await loadOrders(d.id, true);
    })();
  }, [user]);

  useEffect(() => {
    if (!driverId) return;
    const ch = supabase.channel(`driver-orders-${driverId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `driver_id=eq.${driverId}` },
        () => loadOrders(driverId))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `driver_id=eq.${driverId}` },
        () => loadOrders(driverId))
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [driverId]);

  // Live location push + local state for map
  useEffect(() => {
    if (!driverId || !isOnline) return;
    if (!("geolocation" in navigator)) return;
    const watch = navigator.geolocation.watchPosition(
      async (pos) => {
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        await supabase.from("drivers").update({
          current_lat: pos.coords.latitude,
          current_lng: pos.coords.longitude,
          location_updated_at: new Date().toISOString(),
        }).eq("id", driverId);
      },
      (err) => console.warn("geo", err.message),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [driverId, isOnline]);

  const toggleOnline = async (v: boolean) => {
    if (!driverId) return;
    setIsOnline(v);
    await supabase.from("drivers").update({ is_online: v }).eq("id", driverId);
  };

  const updateStatus = async (id: string, status: string) => {
    const patch = status === "delivered"
      ? { status: status as Order["status"], delivered_at: new Date().toISOString() }
      : { status: status as Order["status"] };
    const { error } = await supabase.from("orders").update(patch as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`تم التحديث: ${STATUS_AR[status] ?? status}`);
  };

  const rejectOrder = async (id: string) => {
    const { error } = await supabase.from("orders").update({ status: "pending", driver_id: null } as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.warning("تم رفض الطلب وإعادته للأدمن");
  };

  const totals = {
    active: orders.filter((o) => !["delivered","cancelled","returned"].includes(o.status)).length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    earnings: orders.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.delivery_price), 0),
  };

  if (!driverId) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">لم يتم إعداد ملف المندوب بعد. يرجى التواصل مع المسؤول.</Card>;
  }

  const mapDrivers: MapDriver[] = myPos
    ? [{ id: driverId, lat: myPos.lat, lng: myPos.lng, label: "موقعي الحالي", online: isOnline }]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-cool p-6 shadow-pop text-white">
        <div>
          <h1 className="text-3xl font-extrabold">طلباتي</h1>
          <p className="mt-1 text-sm opacity-90">{isOnline ? "موقعك يُبث مباشرة للأدمن والمطاعم" : "فعّل الاتصال لبدء استقبال الطلبات"}</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white/20 backdrop-blur px-4 py-2">
          <span className={`h-3 w-3 rounded-full ${isOnline ? "bg-success animate-pulse" : "bg-white/40"}`} />
          <span className="text-sm font-semibold">{isOnline ? "متصل" : "غير متصل"}</span>
          <Switch checked={isOnline} onCheckedChange={toggleOnline} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "نشط", value: totals.active, cls: "bg-gradient-primary" },
          { label: "تم التوصيل", value: totals.delivered, cls: "bg-gradient-success" },
          { label: "الأرباح", value: totals.earnings.toFixed(2), cls: "bg-gradient-warm" },
        ].map((c) => (
          <Card key={c.label} className={`${c.cls} p-5 border-0 shadow-soft text-white`}>
            <div className="text-xs uppercase tracking-wider opacity-90">{c.label}</div>
            <div className="mt-2 text-3xl font-extrabold">{c.value}</div>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders"><LayoutDashboard className="ml-2 h-4 w-4" />الطلبات</TabsTrigger>
          <TabsTrigger value="map"><MapIcon className="ml-2 h-4 w-4" />موقعي</TabsTrigger>
          <TabsTrigger value="complaints"><AlertTriangle className="ml-2 h-4 w-4" />الشكاوى</TabsTrigger>
          <TabsTrigger value="chat"><MessagesSquare className="ml-2 h-4 w-4" />المحادثات</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {orders.map((o) => {
              const next = NEXT_STATUS[o.status] ?? [];
              const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.customer_address)}`;
              return (
                <Card key={o.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-primary text-base font-extrabold text-primary-foreground shadow-pop">{o.daily_number ?? "—"}</span>
                      <div>
                        <div className="text-lg font-bold">{o.customer_name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground" dir="ltr">{o.order_number}</div>
                      </div>
                    </div>
                    <Badge className={STATUS_COLORS[o.status]}>{STATUS_AR[o.status] ?? o.status}</Badge>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <a href={`tel:${o.customer_phone}`} className="flex items-center gap-2 text-primary hover:underline" dir="ltr">
                      <Phone className="h-4 w-4" />{o.customer_phone}
                    </a>
                    <a href={mapsHref} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-primary hover:underline">
                      <MapPin className="h-4 w-4 mt-0.5" /><span>{o.customer_address}</span>
                    </a>
                    {o.notes && <p className="text-muted-foreground">{o.notes}</p>}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                    <span className="text-muted-foreground">المبلغ المستحق</span>
                    <span className="font-bold">{Number(o.total).toFixed(2)}</span>
                  </div>
                  {next.length > 0 && (
                    <div className="mt-3 flex gap-2">
                      <Select onValueChange={(v) => updateStatus(o.id, v)}>
                        <SelectTrigger><SelectValue placeholder="تحديث الحالة…" /></SelectTrigger>
                        <SelectContent>
                          {next.map((s) => <SelectItem key={s} value={s}>{STATUS_AR[s] ?? s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {(o.status === "pending" || o.status === "accepted") && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button className="bg-gradient-success shadow-pop" onClick={() => updateStatus(o.id, "preparing")}>قبول</Button>
                      <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => rejectOrder(o.id)}>رفض</Button>
                    </div>
                  )}
                </Card>
              );
            })}
            {orders.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground md:col-span-2">لا توجد طلبات معينة لك.</Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <Card className="p-3">
            <div className="mb-2 text-sm text-muted-foreground">
              {isOnline ? "موقعك يُحدَّث تلقائيًا. يراك الأدمن والمطعم على خريطتهم." : "فعّل وضع الاتصال لبدء بث موقعك."}
            </div>
            <DriversMap drivers={mapDrivers} />
          </Card>
        </TabsContent>

        <TabsContent value="complaints" className="mt-4">
          <ComplaintsList mode="driver" driverId={driverId} />
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <ChatPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
