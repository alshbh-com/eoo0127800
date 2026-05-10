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
import { LayoutDashboard, MapPin, Phone, Truck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/driver")({
  component: DriverPage,
});

const navItems: NavItem[] = [{ to: "/driver", label: "My orders", icon: LayoutDashboard }];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/20 text-warning",
  accepted: "bg-blue-500/20 text-blue-400",
  preparing: "bg-blue-500/20 text-blue-400",
  picked_up: "bg-purple-500/20 text-purple-400",
  on_the_way: "bg-purple-500/20 text-purple-400",
  delivered: "bg-success/20 text-success",
  cancelled: "bg-destructive/20 text-destructive",
};

const NEXT_STATUS: Record<string, string[]> = {
  accepted: ["preparing", "picked_up", "cancelled"],
  preparing: ["picked_up", "cancelled"],
  picked_up: ["on_the_way"],
  on_the_way: ["delivered", "returned"],
};

interface Order {
  id: string; order_number: string; customer_name: string; customer_phone: string;
  customer_address: string; items_total: number; delivery_price: number; total: number;
  status: string; created_at: string; notes: string | null;
}

function DriverPage() {
  const { user, loading, roles } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Truck className="h-8 w-8 animate-pulse text-primary" /></div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes("driver")) return <Navigate to="/" />;
  return (
    <DashboardLayout title="Driver" items={navItems}>
      <Body />
    </DashboardLayout>
  );
}

function Body() {
  const { user } = useAuth();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);

  const loadOrders = async (did: string) => {
    const { data } = await supabase.from("orders").select("*").eq("driver_id", did).order("created_at", { ascending: false });
    if (data) setOrders(data as Order[]);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: d } = await supabase.from("drivers").select("id, is_online").eq("user_id", user.id).maybeSingle();
      if (!d) return;
      setDriverId(d.id); setIsOnline(d.is_online);
      loadOrders(d.id);
    })();
  }, [user]);

  useEffect(() => {
    if (!driverId) return;
    const ch = supabase.channel(`driver-orders-${driverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `driver_id=eq.${driverId}` },
        () => loadOrders(driverId)).subscribe();
    return () => { ch.unsubscribe(); };
  }, [driverId]);

  // Live location push
  useEffect(() => {
    if (!driverId || !isOnline) return;
    if (!("geolocation" in navigator)) return;
    const watch = navigator.geolocation.watchPosition(
      async (pos) => {
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
    const patch: Record<string, unknown> = { status };
    if (status === "delivered") patch.delivered_at = new Date().toISOString();
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status}`);
  };

  const totals = {
    active: orders.filter((o) => !["delivered","cancelled","returned"].includes(o.status)).length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    earnings: orders.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.delivery_price), 0),
  };

  if (!driverId) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Your driver profile is not set up yet. Contact admin.</Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My deliveries</h1>
          <p className="text-sm text-muted-foreground">Track and update your assigned orders.</p>
        </div>
        <Card className="flex items-center gap-3 px-4 py-2">
          <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-success" : "bg-muted-foreground/40"}`} />
          <span className="text-sm">{isOnline ? "Online" : "Offline"}</span>
          <Switch checked={isOnline} onCheckedChange={toggleOnline} />
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active", value: totals.active },
          { label: "Delivered", value: totals.delivered },
          { label: "Earnings", value: totals.earnings.toFixed(2) },
        ].map((c) => (
          <Card key={c.label} className="p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className="mt-2 text-2xl font-bold">{c.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {orders.map((o) => {
          const next = NEXT_STATUS[o.status] ?? [];
          const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.customer_address)}`;
          return (
            <Card key={o.id} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-xs text-muted-foreground">{o.order_number}</div>
                  <div className="mt-1 text-lg font-semibold">{o.customer_name}</div>
                </div>
                <Badge className={STATUS_COLORS[o.status]}>{o.status}</Badge>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <a href={`tel:${o.customer_phone}`} className="flex items-center gap-2 text-primary hover:underline">
                  <Phone className="h-4 w-4" />{o.customer_phone}
                </a>
                <a href={mapsHref} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-primary hover:underline">
                  <MapPin className="h-4 w-4 mt-0.5" /><span>{o.customer_address}</span>
                </a>
                {o.notes && <p className="text-muted-foreground">{o.notes}</p>}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">Collect</span>
                <span className="font-bold">{Number(o.total).toFixed(2)}</span>
              </div>
              {next.length > 0 && (
                <div className="mt-3 flex gap-2">
                  {o.status === "pending" || o.status === "accepted" ? null : null}
                  <Select onValueChange={(v) => updateStatus(o.id, v)}>
                    <SelectTrigger><SelectValue placeholder="Update status…" /></SelectTrigger>
                    <SelectContent>
                      {next.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {o.status === "pending" && (
                <Button className="mt-3 w-full" onClick={() => updateStatus(o.id, "accepted")}>Accept order</Button>
              )}
            </Card>
          );
        })}
        {orders.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground md:col-span-2">No assigned orders.</Card>
        )}
      </div>
    </div>
  );
}
