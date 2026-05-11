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
  Map as MapIcon, MessagesSquare, Eye, KeyRound, Search, Download, Settings as SettingsIcon,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { STATUS_AR, STATUS_COLORS } from "@/lib/i18n";
import { ChatPanel } from "@/components/chat-panel";
import { ComplaintsList } from "@/components/complaints";
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
  id: string; order_number: string; daily_number: number | null; customer_name: string; customer_phone: string;
  customer_address: string; items_total: number; delivery_price: number; total: number;
  status: string; restaurant_id: string; driver_id: string | null; city_id: string | null;
  created_at: string;
}

const STATUSES = ["pending","accepted","preparing","picked_up","on_the_way","on_hold","delivered","cancelled","returned"] as const;

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
      <div className="rounded-2xl bg-gradient-primary p-6 shadow-pop">
        <h1 className="text-3xl font-extrabold tracking-tight">لوحة الأدمن</h1>
        <p className="mt-1 text-sm opacity-90">إدارة شاملة للنظام والطلبات والحسابات.</p>
      </div>
      <Tabs defaultValue="orders">
        <TabsList className="flex flex-wrap h-auto bg-card p-1 shadow-soft rounded-xl">
          <TabsTrigger value="orders"><Package className="ml-2 h-4 w-4" />الطلبات</TabsTrigger>
          <TabsTrigger value="reports"><LayoutDashboard className="ml-2 h-4 w-4" />التقارير</TabsTrigger>
          <TabsTrigger value="map"><MapIcon className="ml-2 h-4 w-4" />التتبع</TabsTrigger>
          <TabsTrigger value="chat"><MessagesSquare className="ml-2 h-4 w-4" />المحادثات</TabsTrigger>
          <TabsTrigger value="cities"><MapPin className="ml-2 h-4 w-4" />المدن</TabsTrigger>
          <TabsTrigger value="restaurants"><Users className="ml-2 h-4 w-4" />المطاعم</TabsTrigger>
          <TabsTrigger value="drivers"><Truck className="ml-2 h-4 w-4" />المندوبين</TabsTrigger>
          <TabsTrigger value="complaints"><AlertTriangle className="ml-2 h-4 w-4" />الشكاوى</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="ml-2 h-4 w-4" />الإعدادات</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-4"><OrdersTab /></TabsContent>
        <TabsContent value="reports" className="mt-4"><ReportsTab /></TabsContent>
        <TabsContent value="map" className="mt-4"><MapTab /></TabsContent>
        <TabsContent value="chat" className="mt-4"><ChatPanel /></TabsContent>
        <TabsContent value="cities" className="mt-4"><CitiesTab /></TabsContent>
        <TabsContent value="restaurants" className="mt-4"><RestaurantsTab /></TabsContent>
        <TabsContent value="drivers" className="mt-4"><DriversTab /></TabsContent>
        <TabsContent value="complaints" className="mt-4"><ComplaintsList mode="admin" /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

async function invokeAdminFn<T = unknown>(name: "admin-create-user" | "admin-manage-user", body: Record<string, unknown>) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error("انتهت الجلسة، سجل الدخول مرة أخرى");
  }

  return supabase.functions.invoke<T>(name, {
    body,
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
  });
}

/* Stats removed — now only inside ReportsTab gated by date filter */

function MapTab() {
  const [drivers, setDrivers] = useState<MapDriver[]>([]);
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("drivers").select("id, phone, is_online, current_lat, current_lng");
      if (!data) return;
      const rows = data as Array<{ id: string; phone: string | null; is_online: boolean; current_lat: number | null; current_lng: number | null }>;
      setDrivers(
        rows
          .filter((d) => d.current_lat != null && d.current_lng != null)
          .map((d) => ({
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
          <TableHeader><TableRow><TableHead>الهاتف</TableHead><TableHead>الاتصال</TableHead><TableHead>الموقع</TableHead><TableHead>الحالة</TableHead><TableHead className="w-40">إجراءات</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((d) => (
              <TableRow key={d.id}>
                <TableCell dir="ltr">{d.phone ?? "—"}</TableCell>
                <TableCell>
                  <span className={`inline-flex h-2 w-2 rounded-full ${d.is_online ? "bg-success" : "bg-muted-foreground/40"}`} />
                  <span className="mr-2 text-xs text-muted-foreground">{d.is_online ? "متصل" : "غير متصل"}</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground" dir="ltr">
                  {d.current_lat && d.current_lng ? `${d.current_lat.toFixed(4)}, ${d.current_lng.toFixed(4)}` : "—"}
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
    const { data, error } = await invokeAdminFn("admin-manage-user", { action: "reset_password", user_id: userId, password: pwd });
    if (error || (data as { error?: string })?.error) return toast.error((data as { error?: string })?.error ?? error?.message ?? "فشل");
    toast.success("تم تغيير كلمة المرور"); setPwd(""); setResetOpen(false);
  };

  const saveEdit = async () => {
    const updates: Record<string, unknown> = role === "restaurant"
      ? { name, phone, city_id: cityId || null, address }
      : { phone, city_id: cityId || null };
    const { error } = await (supabase.from(entity.table) as unknown as { update: (u: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } }).update(updates).eq("id", entity.id);
    if (error) return toast.error(error.message);
    if (phone !== current.phone) {
      await invokeAdminFn("admin-manage-user", { action: "update_phone", user_id: userId, phone });
    }
    toast.success("تم الحفظ"); setEditOpen(false); onChange();
  };

  const remove = async () => {
    const { data, error } = await invokeAdminFn("admin-manage-user", { action: "delete", user_id: userId });
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
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});
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
    ]).then(async ([r, d]) => {
      if (r.data) setRestaurants(r.data as Restaurant[]);
      if (d.data) {
        const ds = d.data as Driver[];
        setDrivers(ds);
        const ids = ds.map((x) => x.user_id).filter(Boolean);
        if (ids.length) {
          const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
          const map: Record<string, string> = {};
          ds.forEach((x) => {
            const p = profs?.find((pp) => pp.id === x.user_id);
            map[x.id] = p?.full_name || x.phone || x.id.slice(0, 6);
          });
          setDriverNames(map);
        }
      }
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
    const { error } = await (supabase.from("orders") as unknown as { update: (u: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } }).update(updates).eq("id", orderId);
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
                  <TableCell><span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-gradient-primary px-2 text-xs font-bold text-primary-foreground">{o.daily_number ?? "—"}</span></TableCell>
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
                          <SelectItem key={d.id} value={d.id}>{driverNames[d.id] ?? d.phone ?? d.id.slice(0, 8)}</SelectItem>)}
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

function ReportsTab() {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [applied, setApplied] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);

  const apply = async () => {
    setLoading(true);
    const [o, r, d] = await Promise.all([
      supabase.from("orders").select("*")
        .gte("created_at", from + "T00:00:00")
        .lte("created_at", to + "T23:59:59")
        .order("created_at", { ascending: false }),
      supabase.from("restaurants").select("*"),
      supabase.from("drivers").select("*"),
    ]);
    if (o.data) setOrders(o.data as Order[]);
    if (r.data) setRestaurants(r.data as Restaurant[]);
    if (d.data) setDrivers(d.data as Driver[]);
    setApplied(true);
    setLoading(false);
  };

  const delivered = orders.filter((o) => o.status === "delivered");
  const totals = {
    orders: orders.length,
    delivered: delivered.length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
    revenue: delivered.reduce((s, o) => s + Number(o.total ?? 0), 0),
    items: delivered.reduce((s, o) => s + Number(o.items_total ?? 0), 0),
    delivery: delivered.reduce((s, o) => s + Number(o.delivery_price ?? 0), 0),
  };

  const restaurantStats = restaurants.map((r) => {
    const list = delivered.filter((o) => o.restaurant_id === r.id);
    return {
      المطعم: r.name,
      عدد_الطلبات: list.length,
      إجمالي_المنتجات: list.reduce((s, o) => s + Number(o.items_total ?? 0), 0).toFixed(2),
      إجمالي_التوصيل: list.reduce((s, o) => s + Number(o.delivery_price ?? 0), 0).toFixed(2),
      للمطعم_بدون_توصيل: list.reduce((s, o) => s + Number(o.items_total ?? 0), 0).toFixed(2),
      الإجمالي_الكلي: list.reduce((s, o) => s + Number(o.total ?? 0), 0).toFixed(2),
    };
  }).filter((s) => s.عدد_الطلبات > 0);

  const driverStats = drivers.map((d) => {
    const list = delivered.filter((o) => o.driver_id === d.id);
    return {
      المندوب: d.phone ?? d.id.slice(0, 8),
      عدد_التوصيلات: list.length,
      أتعاب_التوصيل: list.reduce((s, o) => s + Number(o.delivery_price ?? 0), 0).toFixed(2),
    };
  }).filter((s) => s.عدد_التوصيلات > 0);

  return (
    <div className="space-y-4">
      <Card className="p-5 shadow-soft">
        <div className="mb-3 text-lg font-bold text-gradient-primary">فلتر التقارير</div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
          <div><Label className="text-xs">من تاريخ</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" /></div>
          <div><Label className="text-xs">إلى تاريخ</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" /></div>
          <div className="flex items-end"><Button onClick={apply} disabled={loading} className="bg-gradient-primary shadow-pop">{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}عرض التقرير</Button></div>
          <div className="flex items-end"><Button variant="outline" onClick={() => { setFrom(weekAgo); setTo(today); }}>آخر 7 أيام</Button></div>
        </div>
      </Card>

      {!applied && (
        <Card className="p-12 text-center text-muted-foreground">
          اختر الفترة الزمنية ثم اضغط <span className="font-semibold text-foreground">عرض التقرير</span> لظهور الإحصائيات.
        </Card>
      )}

      {applied && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "إجمالي الطلبات", value: totals.orders, cls: "bg-gradient-primary" },
              { label: "تم التوصيل", value: totals.delivered, cls: "bg-gradient-success" },
              { label: "الإيرادات", value: totals.revenue.toFixed(2), cls: "bg-gradient-warm" },
              { label: "أتعاب التوصيل", value: totals.delivery.toFixed(2), cls: "bg-gradient-cool" },
            ].map((c) => (
              <Card key={c.label} className={`${c.cls} p-5 border-0 shadow-pop`}>
                <div className="text-xs uppercase tracking-wider opacity-90">{c.label}</div>
                <div className="mt-2 text-3xl font-extrabold">{c.value}</div>
              </Card>
            ))}
          </div>

          <Card className="p-5 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-bold">حسابات المطاعم</div>
              <Button variant="outline" size="sm" onClick={() => downloadCSV("restaurants-report.csv", restaurantStats)}>
                <Download className="ml-2 h-4 w-4" />تصدير
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>المطعم</TableHead><TableHead>الطلبات</TableHead>
                  <TableHead>قيمة المنتجات</TableHead><TableHead>التوصيل</TableHead>
                  <TableHead>للمطعم (بدون توصيل)</TableHead><TableHead>الإجمالي</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {restaurantStats.map((s) => (
                    <TableRow key={s.المطعم}>
                      <TableCell className="font-medium">{s.المطعم}</TableCell>
                      <TableCell><Badge className="bg-gradient-primary">{s.عدد_الطلبات}</Badge></TableCell>
                      <TableCell>{s.إجمالي_المنتجات}</TableCell>
                      <TableCell>{s.إجمالي_التوصيل}</TableCell>
                      <TableCell className="font-bold text-success">{s.للمطعم_بدون_توصيل}</TableCell>
                      <TableCell className="font-semibold">{s.الإجمالي_الكلي}</TableCell>
                    </TableRow>
                  ))}
                  {restaurantStats.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">لا توجد بيانات</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-5 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-bold">مستحقات المندوبين</div>
              <Button variant="outline" size="sm" onClick={() => downloadCSV("drivers-report.csv", driverStats)}>
                <Download className="ml-2 h-4 w-4" />تصدير
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>المندوب</TableHead><TableHead>عدد التوصيلات</TableHead><TableHead>أتعاب التوصيل</TableHead></TableRow></TableHeader>
                <TableBody>
                  {driverStats.map((s) => (
                    <TableRow key={s.المندوب}>
                      <TableCell dir="ltr">{s.المندوب}</TableCell>
                      <TableCell><Badge className="bg-gradient-cool">{s.عدد_التوصيلات}</Badge></TableCell>
                      <TableCell className="font-semibold text-success">{s.أتعاب_التوصيل}</TableCell>
                    </TableRow>
                  ))}
                  {driverStats.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">لا توجد بيانات</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
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
    <div className="space-y-6">
      <Card className="max-w-xl p-6">
        <h3 className="mb-4 text-lg font-bold">إعدادات النظام</h3>
        <form onSubmit={save} className="space-y-4">
          <div><Label>اسم النظام</Label><Input value={appName} onChange={(e) => setAppName(e.target.value)} /></div>
          <div><Label>العملة</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value)} /></div>
          <div><Label>نسبة العمولة %</Label><Input type="number" step="0.01" value={commission} onChange={(e) => setCommission(e.target.value)} dir="ltr" /></div>
          <div><Label>هاتف الدعم</Label><Input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} dir="ltr" /></div>
          <Button type="submit" disabled={loading}>{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ</Button>
        </form>
      </Card>
      <AdminsManager />
    </div>
  );
}

interface AdminRow { user_id: string; full_name: string; phone: string | null }

function AdminsManager() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [open, setOpen] = useState(false);
  const [resetUid, setResetUid] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState("");

  const load = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const ids = (roles ?? []).map((r) => r.user_id as string);
    if (ids.length === 0) { setAdmins([]); return; }
    const { data: profs } = await supabase.from("profiles").select("id, full_name, phone").in("id", ids);
    setAdmins((profs ?? []).map((p) => ({ user_id: p.id as string, full_name: (p.full_name as string) ?? "", phone: (p.phone as string) ?? null })));
  };
  useEffect(() => { load(); }, []);

  const remove = async (uid: string) => {
    try {
      const { data, error } = await invokeAdminFn("admin-manage-user", { action: "delete", user_id: uid });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("تم الحذف");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "فشل الحذف"); }
  };

  const resetPassword = async () => {
    if (!resetUid || newPwd.length < 6) return;
    try {
      const { data, error } = await invokeAdminFn("admin-manage-user", { action: "reset_password", user_id: resetUid, password: newPwd });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("تم تغيير كلمة المرور");
      setResetUid(null); setNewPwd("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "فشل"); }
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold">المسؤولون (Admins)</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="ml-1 h-4 w-4" />إضافة مسؤول</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إضافة مسؤول جديد</DialogTitle></DialogHeader>
            <CreateAdminForm onDone={() => { setOpen(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>الهاتف</TableHead><TableHead className="text-left">إجراءات</TableHead></TableRow></TableHeader>
        <TableBody>
          {admins.map((a) => (
            <TableRow key={a.user_id}>
              <TableCell className="font-medium">{a.full_name || "—"}</TableCell>
              <TableCell dir="ltr">{a.phone ?? "—"}</TableCell>
              <TableCell className="text-left">
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setResetUid(a.user_id); setNewPwd(""); }} title="تغيير كلمة المرور">
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  {a.user_id !== user?.id && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>حذف المسؤول؟</AlertDialogTitle>
                          <AlertDialogDescription>سيتم حذف الحساب نهائياً ولا يمكن التراجع.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(a.user_id)}>حذف</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {admins.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">لا يوجد مسؤولون</TableCell></TableRow>}
        </TableBody>
      </Table>

      <Dialog open={!!resetUid} onOpenChange={(o) => { if (!o) { setResetUid(null); setNewPwd(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>تغيير كلمة المرور</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>كلمة المرور الجديدة</Label>
            <Input type="password" minLength={6} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} dir="ltr" />
            <DialogFooter><Button onClick={resetPassword} disabled={newPwd.length < 6}>حفظ</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CreateAdminForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await invokeAdminFn("admin-create-user", {
        phone, password, full_name: name, role: "admin",
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("تم إنشاء المسؤول");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشلت العملية");
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5"><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>رقم الهاتف</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xxxxxxxx" dir="ltr" required /></div>
      <div className="space-y-1.5"><Label>كلمة المرور</Label><Input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" /></div>
      <DialogFooter>
        <Button type="submit" disabled={loading}>{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إنشاء</Button>
      </DialogFooter>
    </form>
  );
}

function CreateUserForm({ role, cities, onDone }: { role: "restaurant" | "driver"; cities: City[]; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  void cities; // city is chosen per-order by the restaurant, not at user creation

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await invokeAdminFn("admin-create-user", { phone, password, full_name: name, role, name, address: role === "restaurant" ? address : null });
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
      {role === "restaurant" && (
        <div className="space-y-1.5"><Label>عنوان / موقع المطعم</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="مثال: شارع المعز - وسط البلد" /></div>
      )}
      <DialogFooter>
        <Button type="submit" disabled={loading}>{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إنشاء</Button>
      </DialogFooter>
    </form>
  );
}
