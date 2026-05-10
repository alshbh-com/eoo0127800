import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout, type NavItem } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { LayoutDashboard, Plus, Truck, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/restaurant")({
  component: RestaurantPage,
});

const navItems: NavItem[] = [{ to: "/restaurant", label: "Orders", icon: LayoutDashboard }];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/20 text-warning",
  accepted: "bg-blue-500/20 text-blue-400",
  preparing: "bg-blue-500/20 text-blue-400",
  picked_up: "bg-purple-500/20 text-purple-400",
  on_the_way: "bg-purple-500/20 text-purple-400",
  delivered: "bg-success/20 text-success",
  cancelled: "bg-destructive/20 text-destructive",
  returned: "bg-muted text-muted-foreground",
};

interface City { id: string; name: string; delivery_price: number }
interface Order {
  id: string; order_number: string; customer_name: string; customer_phone: string;
  customer_address: string; items_total: number; delivery_price: number; total: number;
  status: string; driver_id: string | null; created_at: string; notes: string | null;
}

function RestaurantPage() {
  const { user, loading, roles } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Truck className="h-8 w-8 animate-pulse text-primary" /></div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes("restaurant")) return <Navigate to="/" />;
  return (
    <DashboardLayout title="Restaurant" items={navItems}>
      <Body />
    </DashboardLayout>
  );
}

function Body() {
  const { user } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [open, setOpen] = useState(false);

  const loadOrders = async (rid: string) => {
    const { data } = await supabase.from("orders").select("*").eq("restaurant_id", rid).order("created_at", { ascending: false });
    if (data) setOrders(data as Order[]);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: r } = await supabase.from("restaurants").select("id").eq("user_id", user.id).maybeSingle();
      if (!r) return;
      setRestaurantId(r.id);
      loadOrders(r.id);
      const { data: c } = await supabase.from("cities").select("*").order("name");
      if (c) setCities(c);
    })();
  }, [user]);

  useEffect(() => {
    if (!restaurantId) return;
    const ch = supabase.channel(`rest-orders-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => loadOrders(restaurantId)).subscribe();
    return () => { ch.unsubscribe(); };
  }, [restaurantId]);

  const totals = {
    count: orders.length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    revenue: orders.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.total), 0),
  };

  if (!restaurantId) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Your restaurant profile is not set up yet. Contact admin.</Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-sm text-muted-foreground">Manage your incoming orders.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New order</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create order</DialogTitle></DialogHeader>
            <NewOrderForm restaurantId={restaurantId} cities={cities} onDone={() => { setOpen(false); loadOrders(restaurantId); }} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total orders", value: totals.count },
          { label: "Delivered", value: totals.delivered },
          { label: "Revenue", value: totals.revenue.toFixed(2) },
        ].map((c) => (
          <Card key={c.label} className="p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className="mt-2 text-2xl font-bold">{c.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-5 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>#</TableHead><TableHead>Customer</TableHead><TableHead>Address</TableHead>
            <TableHead>Total</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                <TableCell>
                  <div className="font-medium">{o.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                </TableCell>
                <TableCell className="max-w-[220px] truncate">{o.customer_address}</TableCell>
                <TableCell>{Number(o.total).toFixed(2)}</TableCell>
                <TableCell><Badge className={STATUS_COLORS[o.status]}>{o.status}</Badge></TableCell>
              </TableRow>
            ))}
            {orders.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No orders yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function NewOrderForm({ restaurantId, cities, onDone }: { restaurantId: string; cities: City[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [cityId, setCityId] = useState("");
  const [itemsTotal, setItemsTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const city = cities.find((c) => c.id === cityId);
  const deliveryPrice = city?.delivery_price ?? 0;
  const total = (Number(itemsTotal) || 0) + Number(deliveryPrice);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("orders").insert({
      restaurant_id: restaurantId,
      customer_name: name,
      customer_phone: phone,
      customer_address: address,
      city_id: cityId || null,
      items_total: Number(itemsTotal),
      delivery_price: Number(deliveryPrice),
      notes: notes || null,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Order created");
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Customer name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
      </div>
      <div className="space-y-1.5"><Label>Address</Label><Textarea value={address} onChange={(e) => setAddress(e.target.value)} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>City</Label>
          <Select value={cityId} onValueChange={setCityId}>
            <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
            <SelectContent>{cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Items total</Label><Input type="number" step="0.01" value={itemsTotal} onChange={(e) => setItemsTotal(e.target.value)} required /></div>
      </div>
      <div className="rounded-md bg-muted p-3 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{Number(deliveryPrice).toFixed(2)}</span></div>
        <div className="mt-1 flex justify-between font-semibold"><span>Total</span><span>{total.toFixed(2)}</span></div>
      </div>
      <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <DialogFooter><Button type="submit" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create order</Button></DialogFooter>
    </form>
  );
}
