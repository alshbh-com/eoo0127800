import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout, type NavItem } from "@/components/dashboard-layout";
import { DriversMap, type MapDriver } from "@/components/drivers-map";
import { OrderDetailsDialog } from "@/components/order-details-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  LayoutDashboard, MapPin, Users, Package, Plus, Trash2, Truck, Loader2,
  Map as MapIcon, MessagesSquare, Eye, KeyRound, Search, Download, Settings as SettingsIcon, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { STATUS_AR, STATUS_COLORS } from "@/lib/i18n";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ChatPanel } from "@/components/chat-panel";
import { useNotificationPermission, notify } from "@/lib/notifications";
import { downloadCSV } from "@/lib/export";

export const Route = createFileRoute("/admin")({ component: AdminPage });

const navItems: NavItem[] = [
  { to: "/admin", label: "اللوحة", icon: LayoutDashboard },
];

interface City { id: string; name: string; delivery_price: number; is_active: boolean }
interface Restaurant { id: string; name: string; phone: string | null; city_id: string | null; is_active: boolean; user_id: string; address: string | null }
interface Driver {
  id: string; phone: string | null; city_id: string | null; is_online: boolean; is_active: boolean; user_id: string;
  current_lat: number | null; current_lng: number | null; vehicle_type: string | null;
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
        <p className="text-sm text-muted-foreground">إدارة شاملة للنظام والطلبات والحسابات.</p>
      </div>
      <Stats />
      <Tabs defaultValue="orders">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="orders"><Package className="ml-2 h-4 w-4" />الطلبات</TabsTrigger>
          <TabsTrigger value="map"><MapIcon className="ml-2 h-4 w-4" />التتبع</TabsTrigger>
          <TabsTrigger value="chat"><MessagesSquare className="ml-2 h-4 w-4" />المحادثات</TabsTrigger>
          <TabsTrigger value="accounting"><Wallet className="ml-2 h-4 w-4" />الحسابات</TabsTrigger>
          <TabsTrigger value="cities"><MapPin className="ml-2 h-4 w-4" />المدن</TabsTrigger>
          <TabsTrigger value="restaurants"><Users className="ml-2 h-4 w-4" />المطاعم</TabsTrigger>
          <TabsTrigger value="drivers"><Truck className="ml-2 h-4 w-4" />المندوبين</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="ml-2 h-4 w-4" />الإعدادات</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-4"><OrdersTab /></TabsContent>
        <TabsContent value="map" className="mt-4"><MapTab /></TabsContent>
        <TabsContent value="chat" className="mt-4"><ChatPanel /></TabsContent>
        <TabsContent value="accounting" className="mt-4"><AccountingTab /></TabsContent>
        <TabsContent value="cities" className="mt-4"><CitiesTab /></TabsContent>
        <TabsContent value="restaurants" className="mt-4"><RestaurantsTab /></TabsContent>
        <TabsContent value="drivers" className="mt-4"><DriversTab /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsTab /></TabsContent>
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
        delivered: data.filter((o: { status: string }) => o.status === "delivered").length,
        cancelled: data.filter((o: { status: string }) => o.status === "cancelled").length,
        revenue: data.filter((o: { status: string }) => o.status === "delivered").reduce((s: number, o: { total: number }) => s + Number(o.total), 0),
      });
      const days: Record<string, { orders: number; revenue: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const k = d.toISOString().slice(0, 10);
        days[k] = { orders: 0, revenue: 0 };
      }
      data.forEach((o: { status: string; total: number; created_at: string }) => {
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
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe();
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
          .filter((d: { current_lat: number | null; current_lng: number | null }) => d.current_lat != null && d.current_lng != null)
          .map((d: { id: string; phone: string | null; is_online: boolean; current_lat: number; current_lng: number }) => ({
            id: d.id, lat: Number(d.current_lat), lng: Number(d.current_lng),
            label: d.phone ?? d.id.slice(0, 8), online: !!d.is_online,
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
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");

  const load = async () => {
    const { data } = await supabase.from("cities").select("*").order("name");
    if (data) setCities(data as City[]);
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
  const startEdit = (c: City) => { setEditId(c.id); setEditName(c.name); setEditPrice(String(c.delivery_price)); };
  const saveEdit = async () => {
    if (!editId) return;
    const { error } = await supabase.from("cities").update({ name: editName, delivery_price: Number(editPrice) }).eq("id", editId);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ"); setEditId(null); load();
  };

  return (
    <Card className="p-5">
      <form onSubmit={add} className="mb-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <Input placeholder="اسم المدينة" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input placeholder="سعر التوصيل" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        <Button type="submit"><Plus className="ml-2 h-4 w-4" />إضافة</Button>
      </form>
      <Table>
        <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>سعر التوصيل</TableHead><TableHead className="w-32"></TableHead></TableRow></TableHeader>
        <TableBody>
          {cities.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                {editId === c.id ? <Input value={editName} onChange={(e) => setEditName(e.target.value)} /> : c.name}
              </TableCell>
              <TableCell>
                {editId === c.id ? <Input type="number" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} /> : Number(c.delivery_price).toFixed(2)}
              </TableCell>
              <TableCell className="space-x-reverse space-x-1">
                {editId === c.id ? (
                  <>
                    <Button size="sm" onClick={saveEdit}>حفظ</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>إلغاء</Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(c)}>تعديل</Button>
                    <Button variant="ghost" size="icon" onClick={() => del(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </>
                )}
              </TableCell>
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
    if (r.data) setItems(r.data as Restaurant[]);
    if (c.data) setCities(c.data as City[]);
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
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>الهاتف</TableHead><TableHead>المدينة</TableHead><TableHead>الحالة</TableHead><TableHead className="w-40">إجراءات</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell dir="ltr">{r.phone ?? "—"}</TableCell>
                <TableCell>{cities.find((c) => c.id === r.city_id)?.name ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={async (v) => {
                        await supabase.from("restaurants").update({ is_active: v }).eq("id", r.id);
                        toast.success(v ? "تم التفعيل" : "تم الإيقاف");
                        load();
                      }}
                    />
                    <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "نشط" : "موقوف"}</Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <UserActions userId={r.user_id} entity={{ table: "restaurants", id: r.id, label: r.name }} cities={cities} role="restaurant" current={{ name: r.name, phone: r.phone ?? "", city_id: r.city_id, address: r.address }} onChange={load} />
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">لا توجد مطاعم</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
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
    if (c.data) setCities(c.data as City[]);
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
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>الهاتف</TableHead><TableHead>المدينة</TableHead><TableHead>الاتصال</TableHead><TableHead>الحالة</TableHead><TableHead className="w-40">إجراءات</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((d) => (
              <TableRow key={d.id}>
                <TableCell dir="ltr">{d.phone ?? "—"}</TableCell>
                <TableCell>{cities.find((c) => c.id === d.city_id)?.name ?? "—"}</TableCell>
                <TableCell>
                  <span className={`inline-flex h-2 w-2 rounded-full ${d.is_online ? "bg-success" : "bg-muted-foreground/40"}`} />
                  <span className="mr-2 text-xs text-muted-foreground">{d.is_online ? "متصل" : "غير متصل"}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={d.is_active}
                      onCheckedChange={async (v) => {
                        await supabase.from("drivers").update({ is_active: v }).eq("id", d.id);
                        toast.success(v ? "تم التفعيل" : "تم الإيقاف"); load();
                      }}
                    />
                    <Badge variant={d.is_active ? "default" : "secondary"}>{d.is_active ? "نشط" : "موقوف"}</Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <UserActions userId={d.user_id} entity={{ table: "drivers", id: d.id, label: d.phone ?? d.id }} cities={cities} role="driver" current={{ name: "", phone: d.phone ?? "", city_id: d.city_id, address: null }} onChange={load} />
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">لا يوجد مندوبين</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function UserActions({ userId, entity, cities, role, current, onChange }: {
  userId: string;
  entity: { table: "restaurants" | "drivers"; id: string; label: string };
  cities: City[];
  role: "restaurant" | "driver";
  current: { name: string; phone: string; city_id: string | null; address: string | null };
  onChange: () => void;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [name, setName] = useState(current.name);
  const [phone, setPhone] = useState(current.phone);
  const [cityId, setCityId] = useState(current.city_id ?? "");
  const [address, setAddress] = useState(current.address ?? "");

  const resetPassword = async () => {
    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "reset_password", user_id: userId, password: pwd },
    });
    if (error || (data as { error?: string })?.error) return toast.error((data as { error?: string })?.error ?? error?.message ?? "فشل");
    toast.success("تم تغيير كلمة المرور"); setPwd(""); setResetOpen(false);
  };

  const saveEdit = async () => {
    const updates: Record<string, unknown> = role === "restaurant"
      ? { name, phone, city_id: cityId || null, address }
      : { phone, city_id: cityId || null };
    const { error } = await supabase.from(entity.table).update(updates).eq("id", entity.id);
    if (error) return toast.error(error.message);
    if (phone !== current.phone) {
      await supabase.functions.invoke("admin-manage-user", {
        body: { action: "update_phone", user_id: userId, phone },
      });
    }
    toast.success("تم الحفظ"); setEditOpen(false); onChange();
  };

  const remove = async () => {
    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "delete", user_id: userId },
    });
    if (error || (data as { error?: string })?.error) return toast.error((data as { error?: string })?.error ?? error?.message ?? "فشل");
    toast.success("تم الحذف"); onChange();
  };

  return (
    <div className="flex items-center gap-1">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild><Button variant="ghost" size="sm">تعديل</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>تعديل {role === "restaurant" ? "المطعم" : "المندوب"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {role === "restaurant" && (
              <div className="space-y-1.5"><Label>اسم المطعم</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            )}
            <div className="space-y-1.5"><Label>الهاتف</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" /></div>
            <div className="space-y-1.5">
              <Label>المدينة</Label>
              <Select value={cityId} onValueChange={setCityId}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {role === "restaurant" && (
              <div className="space-y-1.5"><Label>العنوان</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
            )}
          </div>
          <DialogFooter><Button onClick={saveEdit}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogTrigger asChild><Button variant="ghost" size="icon" title="تغيير كلمة المرور"><KeyRound className="h-4 w-4" /></Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>كلمة مرور جديدة</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>كلمة المرور</Label>
            <Input type="password" minLength={6} value={pwd} onChange={(e) => setPwd(e.target.value)} dir="ltr" />
          </div>
          <DialogFooter><Button onClick={resetPassword} disabled={pwd.length < 6}>تأكيد</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog>
        <AlertDialogTrigger asChild><Button variant="ghost" size="icon" title="حذف"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف نهائي؟</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف الحساب نهائياً ({entity.label}). لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [restaurantFilter, setRestaurantFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (data) setOrders(data as Order[]);
  };
  useEffect(() => {
    load();
    Promise.all([
      supabase.from("restaurants").select("*"),
      supabase.from("drivers").select("*"),
    ]).then(([r, d]) => {
      if (r.data) setRestaurants(r.data as Restaurant[]);
      if (d.data) setDrivers(d.data as Driver[]);
    });
    const ch = supabase.channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe();
    return () => { ch.unsubscribe(); };
  }, []);

  const assignDriver = async (orderId: string, driverId: string) => {
    const { error } = await supabase.from("orders").update({ driver_id: driverId, status: "accepted" }).eq("id", orderId);
    if (error) return toast.error(error.message);
    toast.success("تم تعيين المندوب");
  };

  const updateStatus = async (orderId: string, status: string) => {
    const updates: Record<string, unknown> = { status };
    if (status === "delivered") updates.delivered_at = new Date().toISOString();
    const { error } = await supabase.from("orders").update(updates).eq("id", orderId);
    if (error) return toast.error(error.message);
    toast.success("تم تحديث الحالة");
  };

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (restaurantFilter !== "all" && o.restaurant_id !== restaurantFilter) return false;
      if (from && new Date(o.created_at) < new Date(from)) return false;
      if (to && new Date(o.created_at) > new Date(to + "T23:59:59")) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!o.order_number.toLowerCase().includes(s) && !o.customer_name.toLowerCase().includes(s) && !o.customer_phone.includes(s)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, restaurantFilter, search, from, to]);

  const exportCsv = () => {
    const rows = filtered.map((o) => ({
      رقم: o.order_number,
      العميل: o.customer_name,
      الهاتف: o.customer_phone,
      العنوان: o.customer_address,
      المطعم: restaurants.find((r) => r.id === o.restaurant_id)?.name ?? "",
      المندوب: drivers.find((d) => d.id === o.driver_id)?.phone ?? "",
      المنتجات: Number(o.items_total).toFixed(2),
      التوصيل: Number(o.delivery_price).toFixed(2),
      الإجمالي: Number(o.total).toFixed(2),
      الحالة: STATUS_AR[o.status] ?? o.status,
      التاريخ: new Date(o.created_at).toLocaleString(),
    }));
    downloadCSV(`orders-${new Date().toISOString().slice(0,10)}.csv`, rows);
  };

  return (
    <Card className="p-5">
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_180px_140px_140px_auto]">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="بحث برقم الطلب أو الاسم أو الهاتف…" value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_AR[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المطاعم</SelectItem>
            {restaurants.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
        <Button variant="outline" onClick={exportCsv}><Download className="ml-2 h-4 w-4" />CSV</Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>#</TableHead><TableHead>العميل</TableHead><TableHead>المطعم</TableHead>
            <TableHead>الإجمالي</TableHead><TableHead>الحالة</TableHead><TableHead>المندوب</TableHead><TableHead className="w-12"></TableHead>
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
                  <TableCell>
                    <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v)}>
                      <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_AR[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={o.driver_id ?? ""} onValueChange={(v) => assignDriver(o.id, v)}>
                      <SelectTrigger className="w-40 h-8"><SelectValue placeholder="تعيين…" /></SelectTrigger>
                      <SelectContent>
                        {drivers.filter((d) => d.is_active).map((d) =>
                          <SelectItem key={d.id} value={d.id}>{d.phone ?? d.id.slice(0, 8)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setDetailsId(o.id)}><Eye className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">لا توجد طلبات</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <OrderDetailsDialog orderId={detailsId} open={!!detailsId} onOpenChange={(v) => !v && setDetailsId(null)} />
      <div className="mt-3 text-xs text-muted-foreground">{filtered.length} من {orders.length}</div>
    </Card>
  );
}

function AccountingTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("restaurants").select("*"),
      supabase.from("drivers").select("*"),
    ]).then(([o, r, d]) => {
      if (o.data) setOrders(o.data as Order[]);
      if (r.data) setRestaurants(r.data as Restaurant[]);
      if (d.data) setDrivers(d.data as Driver[]);
    });
  }, []);

  const inRange = (o: Order) => {
    if (from && new Date(o.created_at) < new Date(from)) return false;
    if (to && new Date(o.created_at) > new Date(to + "T23:59:59")) return false;
    return true;
  };

  const restaurantStats = restaurants.map((r) => {
    const list = orders.filter((o) => o.restaurant_id === r.id && o.status === "delivered" && inRange(o));
    return {
      المطعم: r.name,
      الطلبات_المسلّمة: list.length,
      إجمالي_المنتجات: list.reduce((s, o) => s + Number(o.items_total), 0).toFixed(2),
      إجمالي_التوصيل: list.reduce((s, o) => s + Number(o.delivery_price), 0).toFixed(2),
      الإجمالي: list.reduce((s, o) => s + Number(o.total), 0).toFixed(2),
    };
  });

  const driverStats = drivers.map((d) => {
    const list = orders.filter((o) => o.driver_id === d.id && o.status === "delivered" && inRange(o));
    return {
      المندوب: d.phone ?? d.id.slice(0, 8),
      الطلبات: list.length,
      أتعاب_التوصيل: list.reduce((s, o) => s + Number(o.delivery_price), 0).toFixed(2),
    };
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">من</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" /></div>
          <div><Label className="text-xs">إلى</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" /></div>
          <Button variant="outline" onClick={() => { setFrom(""); setTo(""); }}>مسح</Button>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold">حسابات المطاعم</div>
          <Button variant="outline" size="sm" onClick={() => downloadCSV("restaurants-accounting.csv", restaurantStats)}>
            <Download className="ml-2 h-4 w-4" />تصدير
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>المطعم</TableHead><TableHead>الطلبات</TableHead><TableHead>منتجات</TableHead><TableHead>توصيل</TableHead><TableHead>الإجمالي</TableHead></TableRow></TableHeader>
            <TableBody>
              {restaurantStats.map((s) => (
                <TableRow key={s.المطعم}>
                  <TableCell className="font-medium">{s.المطعم}</TableCell>
                  <TableCell>{s.الطلبات_المسلّمة}</TableCell>
                  <TableCell>{s.إجمالي_المنتجات}</TableCell>
                  <TableCell>{s.إجمالي_التوصيل}</TableCell>
                  <TableCell className="font-semibold">{s.الإجمالي}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold">مستحقات المندوبين</div>
          <Button variant="outline" size="sm" onClick={() => downloadCSV("drivers-accounting.csv", driverStats)}>
            <Download className="ml-2 h-4 w-4" />تصدير
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>المندوب</TableHead><TableHead>الطلبات</TableHead><TableHead>أتعاب التوصيل</TableHead></TableRow></TableHeader>
            <TableBody>
              {driverStats.map((s) => (
                <TableRow key={s.المندوب}>
                  <TableCell dir="ltr">{s.المندوب}</TableCell>
                  <TableCell>{s.الطلبات}</TableCell>
                  <TableCell className="font-semibold">{s.أتعاب_التوصيل}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function SettingsTab() {
  const [appName, setAppName] = useState("");
  const [currency, setCurrency] = useState("");
  const [commission, setCommission] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (data) {
        setAppName(data.app_name ?? "O&R");
        setCurrency(data.currency ?? "ج.م");
        setCommission(String(data.commission_rate ?? 0));
        setSupportPhone(data.support_phone ?? "");
      }
    })();
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("app_settings").update({
      app_name: appName, currency, commission_rate: Number(commission), support_phone: supportPhone,
    }).eq("id", 1);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ الإعدادات");
  };

  return (
    <Card className="max-w-xl p-6">
      <form onSubmit={save} className="space-y-4">
        <div><Label>اسم النظام</Label><Input value={appName} onChange={(e) => setAppName(e.target.value)} /></div>
        <div><Label>العملة</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value)} /></div>
        <div><Label>نسبة العمولة %</Label><Input type="number" step="0.01" value={commission} onChange={(e) => setCommission(e.target.value)} dir="ltr" /></div>
        <div><Label>هاتف الدعم</Label><Input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} dir="ltr" /></div>
        <Button type="submit" disabled={loading}>{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ</Button>
      </form>
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
          <SelectContent>{cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={loading}>{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إنشاء</Button>
      </DialogFooter>
    </form>
  );
}
