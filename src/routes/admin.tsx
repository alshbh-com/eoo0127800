import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout, type NavItem } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { LayoutDashboard, MapPin, Users, Package, Plus, Trash2, Truck, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

const navItems: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
];

interface City { id: string; name: string; delivery_price: number; is_active: boolean }
interface Restaurant { id: string; name: string; phone: string | null; city_id: string | null; is_active: boolean }
interface Driver { id: string; phone: string | null; city_id: string | null; is_online: boolean; is_active: boolean; user_id: string }
interface Order {
  id: string; order_number: string; customer_name: string; customer_phone: string;
  customer_address: string; items_total: number; delivery_price: number; total: number;
  status: string; restaurant_id: string; driver_id: string | null; city_id: string | null;
  created_at: string;
}

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

function AdminPage() {
  const { user, loading: authLoading, roles } = useAuth();
  if (authLoading) return <div className="flex min-h-screen items-center justify-center"><Truck className="h-8 w-8 animate-pulse text-primary" /></div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes("admin")) return <Navigate to="/" />;

  return (
    <DashboardLayout title="Admin" items={navItems}>
      <AdminContent />
    </DashboardLayout>
  );
}

function AdminContent() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">Manage cities, restaurants, drivers, and orders.</p>
      </div>
      <Stats />
      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders"><Package className="mr-2 h-4 w-4" />Orders</TabsTrigger>
          <TabsTrigger value="cities"><MapPin className="mr-2 h-4 w-4" />Cities</TabsTrigger>
          <TabsTrigger value="restaurants"><Users className="mr-2 h-4 w-4" />Restaurants</TabsTrigger>
          <TabsTrigger value="drivers"><Truck className="mr-2 h-4 w-4" />Drivers</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-4"><OrdersTab /></TabsContent>
        <TabsContent value="cities" className="mt-4"><CitiesTab /></TabsContent>
        <TabsContent value="restaurants" className="mt-4"><RestaurantsTab /></TabsContent>
        <TabsContent value="drivers" className="mt-4"><DriversTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function Stats() {
  const [stats, setStats] = useState({ orders: 0, delivered: 0, cancelled: 0, revenue: 0 });
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("orders").select("status,total");
      if (!data) return;
      setStats({
        orders: data.length,
        delivered: data.filter((o) => o.status === "delivered").length,
        cancelled: data.filter((o) => o.status === "cancelled").length,
        revenue: data.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.total), 0),
      });
    };
    load();
    const ch = supabase.channel("admin-stats")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, []);
  const cards = [
    { label: "Total orders", value: stats.orders },
    { label: "Delivered", value: stats.delivered },
    { label: "Cancelled", value: stats.cancelled },
    { label: "Revenue", value: stats.revenue.toFixed(2) },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</div>
          <div className="mt-2 text-2xl font-bold">{c.value}</div>
        </Card>
      ))}
    </div>
  );
}

function CitiesTab() {
  const [cities, setCities] = useState<City[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const load = async () => {
    const { data } = await supabase.from("cities").select("*").order("name");
    if (data) setCities(data);
  };
  useEffect(() => { load(); }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("cities").insert({ name, delivery_price: Number(price) });
    if (error) return toast.error(error.message);
    setName(""); setPrice(""); toast.success("City added"); load();
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("cities").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("City removed"); load();
  };

  return (
    <Card className="p-5">
      <form onSubmit={add} className="mb-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <Input placeholder="City name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input placeholder="Delivery price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        <Button type="submit"><Plus className="mr-2 h-4 w-4" />Add city</Button>
      </form>
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Delivery price</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
        <TableBody>
          {cities.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.name}</TableCell>
              <TableCell>{Number(c.delivery_price).toFixed(2)}</TableCell>
              <TableCell><Button variant="ghost" size="icon" onClick={() => del(c.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
            </TableRow>
          ))}
          {cities.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">No cities yet</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}

function RestaurantsTab() {
  const [items, setItems] = useState<Restaurant[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const [r, c] = await Promise.all([
      supabase.from("restaurants").select("*").order("created_at", { ascending: false }),
      supabase.from("cities").select("*").order("name"),
    ]);
    if (r.data) setItems(r.data);
    if (c.data) setCities(c.data);
  };
  useEffect(() => { load(); }, []);

  return (
    <Card className="p-5">
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New restaurant</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create restaurant account</DialogTitle></DialogHeader>
            <CreateUserForm role="restaurant" cities={cities} onDone={() => { setOpen(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>City</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell>{r.phone ?? "—"}</TableCell>
              <TableCell>{cities.find((c) => c.id === r.city_id)?.name ?? "—"}</TableCell>
              <TableCell><Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Active" : "Disabled"}</Badge></TableCell>
            </TableRow>
          ))}
          {items.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No restaurants yet</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}

function DriversTab() {
  const [items, setItems] = useState<Driver[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const [d, c] = await Promise.all([
      supabase.from("drivers").select("*").order("created_at", { ascending: false }),
      supabase.from("cities").select("*").order("name"),
    ]);
    if (d.data) setItems(d.data);
    if (c.data) setCities(c.data);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("admin-drivers")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, load).subscribe();
    return () => { ch.unsubscribe(); };
  }, []);

  return (
    <Card className="p-5">
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New driver</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create driver account</DialogTitle></DialogHeader>
            <CreateUserForm role="driver" cities={cities} onDone={() => { setOpen(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Phone</TableHead><TableHead>City</TableHead><TableHead>Online</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {items.map((d) => (
            <TableRow key={d.id}>
              <TableCell>{d.phone ?? "—"}</TableCell>
              <TableCell>{cities.find((c) => c.id === d.city_id)?.name ?? "—"}</TableCell>
              <TableCell>
                <span className={`inline-flex h-2 w-2 rounded-full ${d.is_online ? "bg-success" : "bg-muted-foreground/40"}`} />
                <span className="ml-2 text-xs text-muted-foreground">{d.is_online ? "Online" : "Offline"}</span>
              </TableCell>
              <TableCell><Badge variant={d.is_active ? "default" : "secondary"}>{d.is_active ? "Active" : "Disabled"}</Badge></TableCell>
            </TableRow>
          ))}
          {items.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No drivers yet</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}

function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = async () => {
    const q = supabase.from("orders").select("*").order("created_at", { ascending: false });
    const { data } = await q;
    if (data) setOrders(data as Order[]);
  };
  useEffect(() => {
    load();
    Promise.all([
      supabase.from("restaurants").select("*"),
      supabase.from("drivers").select("*"),
    ]).then(([r, d]) => { if (r.data) setRestaurants(r.data); if (d.data) setDrivers(d.data); });
    const ch = supabase.channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe();
    return () => { ch.unsubscribe(); };
  }, []);

  const assignDriver = async (orderId: string, driverId: string) => {
    const { error } = await supabase.from("orders").update({ driver_id: driverId, status: "accepted" }).eq("id", orderId);
    if (error) return toast.error(error.message);
    toast.success("Driver assigned");
  };

  const filtered = statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {["pending","accepted","preparing","picked_up","on_the_way","delivered","cancelled","returned"].map(s =>
              <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>#</TableHead><TableHead>Customer</TableHead><TableHead>Restaurant</TableHead>
            <TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Driver</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((o) => {
              const rest = restaurants.find((r) => r.id === o.restaurant_id);
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                  <TableCell>
                    <div className="font-medium">{o.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                  </TableCell>
                  <TableCell>{rest?.name ?? "—"}</TableCell>
                  <TableCell>{Number(o.total).toFixed(2)}</TableCell>
                  <TableCell><Badge className={STATUS_COLORS[o.status]}>{o.status}</Badge></TableCell>
                  <TableCell>
                    <Select value={o.driver_id ?? ""} onValueChange={(v) => assignDriver(o.id, v)}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="Assign…" /></SelectTrigger>
                      <SelectContent>
                        {drivers.filter((d) => d.is_active).map((d) =>
                          <SelectItem key={d.id} value={d.id}>{d.phone ?? d.id.slice(0, 8)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No orders</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function CreateUserForm({ role, cities, onDone }: { role: "restaurant" | "driver"; cities: City[]; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cityId, setCityId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: { email, password, full_name: name, phone, role, city_id: cityId || null, name },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success(`${role} created`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5"><Label>{role === "restaurant" ? "Restaurant name" : "Driver name"}</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Password</Label><Input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label>City</Label>
        <Select value={cityId} onValueChange={setCityId}>
          <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
          <SelectContent>
            {cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create</Button>
      </DialogFooter>
    </form>
  );
}
