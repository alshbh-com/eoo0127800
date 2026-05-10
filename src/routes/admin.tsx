import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout, type NavItem } from "@/components/dashboard-layout";
import { DriversMap, type MapDriver } from "@/components/drivers-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { LayoutDashboard, MapPin, Users, Package, Plus, Trash2, Truck, Loader2, Map as MapIcon, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { STATUS_AR, STATUS_COLORS } from "@/lib/i18n";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ChatPanel } from "@/components/chat-panel";
import { useNotificationPermission, notify } from "@/lib/notifications";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

const navItems: NavItem[] = [
  { to: "/admin", label: "اللوحة", icon: LayoutDashboard },
];

interface City { id: string; name: string; delivery_price: number; is_active: boolean }
interface Restaurant { id: string; name: string; phone: string | null; city_id: string | null; is_active: boolean }
interface Driver {
  id: string; phone: string | null; city_id: string | null; is_online: boolean; is_active: boolean; user_id: string;
  current_lat: number | null; current_lng: number | null;
}
interface Order {
  id: string; order_number: string; customer_name: string; customer_phone: string;
  customer_address: string; items_total: number; delivery_price: number; total: number;
  status: string; restaurant_id: string; driver_id: string | null; city_id: string | null;
  created_at: string;
}

const STATUSES = ["pending","accepted","preparing","picked_up","on_the_way","delivered","cancelled","returned"] as const;

function AdminPage() {
  const { user, loading: authLoading, roles } = useAuth();
  if (authLoading) return <div className="flex min-h-screen items-center justify-center"><Truck className="h-8 w-8 animate-pulse text-primary" /></div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes("admin")) return <Navigate to="/" />;

  return (
    <DashboardLayout title="مسؤول" items={navItems}>
      <AdminContent />
    </DashboardLayout>
  );
}

function AdminContent() {
  useNotificationPermission();
  useEffect(() => {
    const ch = supabase.channel("admin-new-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (p) => {
        const o = p.new as { order_number?: string; customer_name?: string };
        toast.info(`طلب جديد: ${o.order_number ?? ""}`);
        notify("طلب جديد", `${o.order_number ?? ""} — ${o.customer_name ?? ""}`);
      }).subscribe();
    return () => { ch.unsubscribe(); };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">لوحة التحكم</h1>
        <p className="text-sm text-muted-foreground">إدارة المدن والمطاعم والمندوبين والطلبات.</p>
      </div>
      <Stats />
      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders"><Package className="ml-2 h-4 w-4" />الطلبات</TabsTrigger>
          <TabsTrigger value="map"><MapIcon className="ml-2 h-4 w-4" />تتبع المندوبين</TabsTrigger>
          <TabsTrigger value="chat"><MessagesSquare className="ml-2 h-4 w-4" />المحادثات</TabsTrigger>
          <TabsTrigger value="cities"><MapPin className="ml-2 h-4 w-4" />المدن</TabsTrigger>
          <TabsTrigger value="restaurants"><Users className="ml-2 h-4 w-4" />المطاعم</TabsTrigger>
          <TabsTrigger value="drivers"><Truck className="ml-2 h-4 w-4" />المندوبين</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-4"><OrdersTab /></TabsContent>
        <TabsContent value="map" className="mt-4"><MapTab /></TabsContent>
        <TabsContent value="chat" className="mt-4"><ChatPanel /></TabsContent>
        <TabsContent value="cities" className="mt-4"><CitiesTab /></TabsContent>
        <TabsContent value="restaurants" className="mt-4"><RestaurantsTab /></TabsContent>
        <TabsContent value="drivers" className="mt-4"><DriversTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function Stats() {
  const [stats, setStats] = useState({ orders: 0, delivered: 0, cancelled: 0, revenue: 0 });
  const [chart, setChart] = useState<{ day: string; orders: number; revenue: number }[]>([]);
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("orders").select("status,total,created_at");
      if (!data) return;
      setStats({
        orders: data.length,
        delivered: data.filter((o) => o.status === "delivered").length,
        cancelled: data.filter((o) => o.status === "cancelled").length,
        revenue: data.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.total), 0),
      });
      // last 7 days
      const days: Record<string, { orders: number; revenue: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const k = d.toISOString().slice(0, 10);
        days[k] = { orders: 0, revenue: 0 };
      }
      data.forEach((o) => {
        const k = new Date(o.created_at).toISOString().slice(0, 10);
        if (days[k]) {
          days[k].orders += 1;
          if (o.status === "delivered") days[k].revenue += Number(o.total);
        }
      });
      setChart(Object.entries(days).map(([day, v]) => ({ day: day.slice(5), ...v })));
    };
    load();
    const ch = supabase.channel("admin-stats")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, []);
  const cards = [
    { label: "إجمالي الطلبات", value: stats.orders },
    { label: "تم التوصيل", value: stats.delivered },
    { label: "ملغي", value: stats.cancelled },
    { label: "الإيرادات", value: stats.revenue.toFixed(2) },
  ];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className="mt-2 text-2xl font-bold">{c.value}</div>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <div className="mb-3 text-sm font-semibold">طلبات وإيرادات آخر 7 أيام</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Line type="monotone" dataKey="orders" stroke="var(--primary)" strokeWidth={2} name="الطلبات" />
              <Line type="monotone" dataKey="revenue" stroke="var(--success)" strokeWidth={2} name="الإيرادات" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </>
  );
}

function MapTab() {
  const [drivers, setDrivers] = useState<MapDriver[]>([]);
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("drivers").select("id, phone, is_online, current_lat, current_lng");
      if (!data) return;
      setDrivers(
        data
          .filter((d) => d.current_lat != null && d.current_lng != null)
          .map((d) => ({
            id: d.id,
            lat: Number(d.current_lat),
            lng: Number(d.current_lng),
            label: d.phone ?? d.id.slice(0, 8),
            online: !!d.is_online,
          })),
      );
    };
    load();
    const ch = supabase.channel("map-drivers")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, load).subscribe();
    return () => { ch.unsubscribe(); };
  }, []);
  return (
    <Card className="p-3">
      <div className="mb-2 text-sm text-muted-foreground">تتبع مباشر للمندوبين على الخريطة ({drivers.length} مندوب نشط)</div>
      <DriversMap drivers={drivers} />
    </Card>
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
    setName(""); setPrice(""); toast.success("تمت إضافة المدينة"); load();
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("cities").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف"); load();
  };

  return (
    <Card className="p-5">
      <form onSubmit={add} className="mb-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <Input placeholder="اسم المدينة" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input placeholder="سعر التوصيل" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        <Button type="submit"><Plus className="ml-2 h-4 w-4" />إضافة</Button>
      </form>
      <Table>
        <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>سعر التوصيل</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
        <TableBody>
          {cities.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.name}</TableCell>
              <TableCell>{Number(c.delivery_price).toFixed(2)}</TableCell>
              <TableCell><Button variant="ghost" size="icon" onClick={() => del(c.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
            </TableRow>
          ))}
          {cities.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">لا توجد مدن</TableCell></TableRow>}
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
          <DialogTrigger asChild><Button><Plus className="ml-2 h-4 w-4" />مطعم جديد</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إنشاء حساب مطعم</DialogTitle></DialogHeader>
            <CreateUserForm role="restaurant" cities={cities} onDone={() => { setOpen(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>الهاتف</TableHead><TableHead>المدينة</TableHead><TableHead>الحالة</TableHead></TableRow></TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell dir="ltr">{r.phone ?? "—"}</TableCell>
              <TableCell>{cities.find((c) => c.id === r.city_id)?.name ?? "—"}</TableCell>
              <TableCell><Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "نشط" : "موقوف"}</Badge></TableCell>
            </TableRow>
          ))}
          {items.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">لا توجد مطاعم</TableCell></TableRow>}
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
    if (d.data) setItems(d.data as Driver[]);
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
          <DialogTrigger asChild><Button><Plus className="ml-2 h-4 w-4" />مندوب جديد</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إنشاء حساب مندوب</DialogTitle></DialogHeader>
            <CreateUserForm role="driver" cities={cities} onDone={() => { setOpen(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>الهاتف</TableHead><TableHead>المدينة</TableHead><TableHead>الاتصال</TableHead><TableHead>الحالة</TableHead></TableRow></TableHeader>
        <TableBody>
          {items.map((d) => (
            <TableRow key={d.id}>
              <TableCell dir="ltr">{d.phone ?? "—"}</TableCell>
              <TableCell>{cities.find((c) => c.id === d.city_id)?.name ?? "—"}</TableCell>
              <TableCell>
                <span className={`inline-flex h-2 w-2 rounded-full ${d.is_online ? "bg-success" : "bg-muted-foreground/40"}`} />
                <span className="mr-2 text-xs text-muted-foreground">{d.is_online ? "متصل" : "غير متصل"}</span>
              </TableCell>
              <TableCell><Badge variant={d.is_active ? "default" : "secondary"}>{d.is_active ? "نشط" : "موقوف"}</Badge></TableCell>
            </TableRow>
          ))}
          {items.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">لا يوجد مندوبين</TableCell></TableRow>}
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
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (data) setOrders(data as Order[]);
  };
  useEffect(() => {
    load();
    Promise.all([
      supabase.from("restaurants").select("*"),
      supabase.from("drivers").select("*"),
    ]).then(([r, d]) => { if (r.data) setRestaurants(r.data); if (d.data) setDrivers(d.data as Driver[]); });
    const ch = supabase.channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe();
    return () => { ch.unsubscribe(); };
  }, []);

  const assignDriver = async (orderId: string, driverId: string) => {
    const { error } = await supabase.from("orders").update({ driver_id: driverId, status: "accepted" }).eq("id", orderId);
    if (error) return toast.error(error.message);
    toast.success("تم تعيين المندوب");
  };

  const filtered = statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <Label className="text-xs text-muted-foreground">الحالة</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_AR[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>#</TableHead><TableHead>العميل</TableHead><TableHead>المطعم</TableHead>
            <TableHead>الإجمالي</TableHead><TableHead>الحالة</TableHead><TableHead>المندوب</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((o) => {
              const rest = restaurants.find((r) => r.id === o.restaurant_id);
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">{o.order_number}</TableCell>
                  <TableCell>
                    <div className="font-medium">{o.customer_name}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{o.customer_phone}</div>
                  </TableCell>
                  <TableCell>{rest?.name ?? "—"}</TableCell>
                  <TableCell>{Number(o.total).toFixed(2)}</TableCell>
                  <TableCell><Badge className={STATUS_COLORS[o.status]}>{STATUS_AR[o.status] ?? o.status}</Badge></TableCell>
                  <TableCell>
                    <Select value={o.driver_id ?? ""} onValueChange={(v) => assignDriver(o.id, v)}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="تعيين…" /></SelectTrigger>
                      <SelectContent>
                        {drivers.filter((d) => d.is_active).map((d) =>
                          <SelectItem key={d.id} value={d.id}>{d.phone ?? d.id.slice(0, 8)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">لا توجد طلبات</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function CreateUserForm({ role, cities, onDone }: { role: "restaurant" | "driver"; cities: City[]; onDone: () => void }) {
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
        body: { phone, password, full_name: name, role, city_id: cityId || null, name },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success(role === "restaurant" ? "تم إنشاء المطعم" : "تم إنشاء المندوب");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشلت العملية");
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5"><Label>{role === "restaurant" ? "اسم المطعم" : "اسم المندوب"}</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>رقم الهاتف</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xxxxxxxx" dir="ltr" required /></div>
      <div className="space-y-1.5"><Label>كلمة المرور</Label><Input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" /></div>
      <div className="space-y-1.5">
        <Label>المدينة</Label>
        <Select value={cityId} onValueChange={setCityId}>
          <SelectTrigger><SelectValue placeholder="اختر المدينة" /></SelectTrigger>
          <SelectContent>
            {cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={loading}>{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إنشاء</Button>
      </DialogFooter>
    </form>
  );
}
