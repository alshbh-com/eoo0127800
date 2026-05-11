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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { LayoutDashboard, Plus, Truck, Loader2, Map as MapIcon, MessagesSquare, UtensilsCrossed, Trash2, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { STATUS_AR, STATUS_COLORS } from "@/lib/i18n";
import { ChatPanel } from "@/components/chat-panel";
import { ComplaintsList } from "@/components/complaints";
import { DriversMap, type MapDriver } from "@/components/drivers-map";
import { useNotificationPermission, notify } from "@/lib/notifications";

export const Route = createFileRoute("/restaurant")({
  component: RestaurantPage,
});

const navItems: NavItem[] = [{ to: "/restaurant", label: "الطلبات", icon: LayoutDashboard }];

interface City { id: string; name: string; delivery_price: number }
interface Product { id: string; name: string; price: number; is_active: boolean }
interface Order {
  id: string; order_number: string; daily_number: number | null; customer_name: string; customer_phone: string;
  customer_address: string; items_total: number; delivery_price: number; total: number;
  status: string; driver_id: string | null; created_at: string; notes: string | null;
}

function RestaurantPage() {
  const { user, loading, roles } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Truck className="h-8 w-8 animate-pulse text-primary" /></div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes("restaurant")) return <Navigate to="/" />;
  return (
    <DashboardLayout title="مطعم" items={navItems}>
      <Body />
    </DashboardLayout>
  );
}

function Body() {
  const { user } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [drivers, setDrivers] = useState<MapDriver[]>([]);
  const [driverInfo, setDriverInfo] = useState<Record<string, { name: string; phone: string | null; user_id: string }>>({});
  const [chatTarget, setChatTarget] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("orders");
  const [open, setOpen] = useState(false);

  useNotificationPermission();

  const loadOrders = async (rid: string) => {
    const { data } = await supabase.from("orders").select("*").eq("restaurant_id", rid).order("created_at", { ascending: false });
    if (data) setOrders(data as Order[]);
  };

  const loadProducts = async (rid: string) => {
    const { data } = await supabase.from("products").select("*").eq("restaurant_id", rid).order("name");
    if (data) setProducts(data as Product[]);
  };

  const loadDrivers = async () => {
    const { data } = await supabase.from("drivers").select("id, user_id, phone, is_online, current_lat, current_lng");
    if (!data) return;
    const userIds = data.map((d) => d.user_id).filter(Boolean) as string[];
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
    const nameMap = new Map((profs ?? []).map((p) => [p.id, p.full_name as string]));
    const info: Record<string, { name: string; phone: string | null; user_id: string }> = {};
    data.forEach((d) => {
      info[d.id] = { name: nameMap.get(d.user_id) || d.phone || "مندوب", phone: d.phone, user_id: d.user_id };
    });
    setDriverInfo(info);
    setDrivers(
      data.filter((d) => d.current_lat != null && d.current_lng != null).map((d) => ({
        id: d.id, lat: Number(d.current_lat), lng: Number(d.current_lng),
        label: info[d.id].name, online: !!d.is_online,
      })),
    );
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: r } = await supabase.from("restaurants").select("id").eq("user_id", user.id).maybeSingle();
      if (!r) return;
      setRestaurantId(r.id);
      loadOrders(r.id);
      loadProducts(r.id);
      const { data: c } = await supabase.from("cities").select("*").order("name");
      if (c) setCities(c);
      loadDrivers();
    })();
  }, [user]);

  useEffect(() => {
    if (!restaurantId) return;
    const ch = supabase.channel(`rest-orders-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        (p) => {
          loadOrders(restaurantId);
          if (p.eventType === "UPDATE") {
            const o = p.new as { order_number?: string; status?: string };
            if (o.status) notify("تحديث طلب", `${o.order_number}: ${STATUS_AR[o.status] ?? o.status}`);
          }
        }).subscribe();
    const dch = supabase.channel("rest-drivers")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, loadDrivers).subscribe();
    return () => { ch.unsubscribe(); dch.unsubscribe(); };
  }, [restaurantId]);

  const totals = {
    today: orders.filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString()).length,
    active: orders.filter((o) => !["delivered","cancelled","returned"].includes(o.status)).length,
    delivered: orders.filter((o) => o.status === "delivered").length,
  };

  if (!restaurantId) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">لم يتم إعداد ملف المطعم بعد. يرجى التواصل مع المسؤول.</Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-warm p-6 shadow-pop">
        <div>
          <h1 className="text-3xl font-extrabold">لوحة المطعم</h1>
          <p className="mt-1 text-sm opacity-90">إدارة طلباتك وقائمتك بسهولة.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="lg" className="bg-white text-primary hover:bg-white/90 shadow-pop"><Plus className="ml-2 h-5 w-5" />طلب جديد</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>إنشاء طلب جديد</DialogTitle></DialogHeader>
            <NewOrderForm restaurantId={restaurantId} cities={cities} products={products} onDone={() => { setOpen(false); loadOrders(restaurantId); }} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "طلبات اليوم", value: totals.today, cls: "bg-gradient-primary" },
          { label: "نشطة الآن", value: totals.active, cls: "bg-gradient-cool" },
          { label: "تم التوصيل (الكلي)", value: totals.delivered, cls: "bg-gradient-success" },
        ].map((c) => (
          <Card key={c.label} className={`${c.cls} p-5 border-0 shadow-soft text-white`}>
            <div className="text-xs uppercase tracking-wider opacity-90">{c.label}</div>
            <div className="mt-2 text-3xl font-extrabold">{c.value}</div>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card p-1 shadow-soft rounded-xl">
          <TabsTrigger value="orders"><LayoutDashboard className="ml-2 h-4 w-4" />الطلبات</TabsTrigger>
          <TabsTrigger value="products"><UtensilsCrossed className="ml-2 h-4 w-4" />القائمة</TabsTrigger>
          <TabsTrigger value="map"><MapIcon className="ml-2 h-4 w-4" />تتبع المندوبين</TabsTrigger>
          <TabsTrigger value="complaints"><AlertTriangle className="ml-2 h-4 w-4" />الشكاوى</TabsTrigger>
          <TabsTrigger value="chat"><MessagesSquare className="ml-2 h-4 w-4" />المحادثات</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <Card className="p-5 overflow-x-auto shadow-soft">
            <Table>
              <TableHeader><TableRow>
                <TableHead>#</TableHead><TableHead>العميل</TableHead><TableHead>العنوان</TableHead>
                <TableHead>المندوب</TableHead>
                <TableHead>الإجمالي</TableHead><TableHead>الحالة</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const info = o.driver_id ? driverInfo[o.driver_id] : null;
                  return (
                  <TableRow key={o.id}>
                    <TableCell><span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-gradient-primary px-2 text-sm font-bold text-primary-foreground shadow-soft">{o.daily_number ?? "—"}</span></TableCell>
                    <TableCell>
                      <div className="font-medium">{o.customer_name}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">{o.customer_phone}</div>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">{o.customer_address}</TableCell>
                    <TableCell>
                      {info ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">{info.name}</div>
                          <div className="flex gap-1">
                            {info.phone && (
                              <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                                <a href={`tel:${info.phone}`}>اتصال</a>
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                              onClick={() => { setChatTarget(info.user_id); setActiveTab("chat"); }}>
                              رسالة
                            </Button>
                          </div>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">— لم يُعيَّن</span>}
                    </TableCell>
                    <TableCell className="font-semibold">{Number(o.total).toFixed(2)}</TableCell>
                    <TableCell><Badge className={STATUS_COLORS[o.status]}>{STATUS_AR[o.status] ?? o.status}</Badge></TableCell>
                  </TableRow>
                  );
                })}
                {orders.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">لا توجد طلبات</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <ProductsTab restaurantId={restaurantId} products={products} reload={() => loadProducts(restaurantId)} />
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <Card className="p-3 shadow-soft">
            <div className="mb-2 text-sm text-muted-foreground">المندوبين النشطين على الخريطة ({drivers.length})</div>
            <DriversMap drivers={drivers} />
          </Card>
        </TabsContent>

        <TabsContent value="complaints" className="mt-4">
          <ComplaintsList mode="restaurant" restaurantId={restaurantId} />
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <ChatPanel initialContactId={chatTarget} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProductsTab({ restaurantId, products, reload }: { restaurantId: string; products: Product[]; reload: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("products").insert({ restaurant_id: restaurantId, name, price: Number(price) });
    if (error) return toast.error(error.message);
    setName(""); setPrice(""); toast.success("تمت إضافة المنتج"); reload();
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف"); reload();
  };
  return (
    <Card className="p-5 shadow-soft">
      <form onSubmit={add} className="mb-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <Input placeholder="اسم المنتج" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input placeholder="السعر" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        <Button type="submit" className="bg-gradient-primary shadow-pop"><Plus className="ml-2 h-4 w-4" />إضافة</Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <Card key={p.id} className="p-4 flex items-center justify-between shadow-soft">
            <div>
              <div className="font-semibold">{p.name}</div>
              <div className="text-sm text-primary font-bold">{Number(p.price).toFixed(2)}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => del(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </Card>
        ))}
        {products.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
            لا توجد منتجات بعد. أضف أول منتج لتظهر في الطلبات بسرعة.
          </Card>
        )}
      </div>
    </Card>
  );
}

function NewOrderForm({ restaurantId, cities, products, onDone }: { restaurantId: string; cities: City[]; products: Product[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [cityId, setCityId] = useState("");
  const [cart, setCart] = useState<Array<{ name: string; price: number; qty: number }>>([]);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [manualTotal, setManualTotal] = useState("");
  const [driverNotes, setDriverNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const city = cities.find((c) => c.id === cityId);
  const deliveryPrice = city?.delivery_price ?? 0;
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const itemsTotal = cartTotal > 0 ? cartTotal : Number(manualTotal) || 0;
  const total = itemsTotal + Number(deliveryPrice);

  const addProduct = (p: Product) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.name === p.name);
      if (ex) return prev.map((i) => i === ex ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { name: p.name, price: Number(p.price), qty: 1 }];
    });
  };

  const addCustomProduct = () => {
    if (!productName.trim()) return;
    const price = Number(productPrice) || 0;
    setCart((prev) => [...prev, { name: productName.trim(), price, qty: 1 }]);
    setProductName(""); setProductPrice("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const itemsLine = cart.length > 0 ? cart.map((i) => `${i.name} × ${i.qty}`).join("، ") : "";
    const combined = [itemsLine, driverNotes && `📝 للمندوب: ${driverNotes}`].filter(Boolean).join("\n");
    const { error } = await supabase.from("orders").insert({
      restaurant_id: restaurantId,
      customer_name: name,
      customer_phone: phone,
      customer_address: address,
      city_id: cityId || null,
      items_total: itemsTotal,
      delivery_price: Number(deliveryPrice),
      notes: combined || null,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم إنشاء الطلب");
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>اسم العميل</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="space-y-1.5"><Label>رقم الهاتف</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} required dir="ltr" /></div>
      </div>
      <div className="space-y-1.5"><Label>العنوان</Label><Textarea value={address} onChange={(e) => setAddress(e.target.value)} required /></div>
      <div className="space-y-1.5">
        <Label>المدينة (يحدد سعر التوصيل تلقائياً)</Label>
        <Select value={cityId} onValueChange={setCityId}>
          <SelectTrigger><SelectValue placeholder="اختر المدينة" /></SelectTrigger>
          <SelectContent>{cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} — {Number(c.delivery_price).toFixed(2)}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {products.length > 0 && (
        <div className="space-y-2">
          <Label>إضافة من القائمة</Label>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto rounded-md border p-2">
            {products.map((p) => (
              <Button type="button" key={p.id} variant="outline" size="sm" onClick={() => addProduct(p)}>
                {p.name} <span className="text-xs text-muted-foreground mr-2">({Number(p.price).toFixed(2)})</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {cart.length > 0 && (
        <div className="rounded-md border p-2 space-y-1">
          {cart.map((i, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm">
              <span>{i.name} × {i.qty}</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{(i.price * i.qty).toFixed(2)}</span>
                <Button type="button" variant="ghost" size="icon" onClick={() => setCart((p) => p.filter((_, j) => j !== idx))}><X className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {cart.length === 0 && (
        <div className="space-y-1.5"><Label>قيمة الطلب يدوياً</Label><Input type="number" step="0.01" value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} placeholder="إذا لم تستخدم القائمة" /></div>
      )}

      <div className="rounded-md bg-muted p-3 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">قيمة المنتجات</span><span>{itemsTotal.toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">سعر التوصيل</span><span>{Number(deliveryPrice).toFixed(2)}</span></div>
        <div className="flex justify-between font-bold text-lg text-primary border-t pt-1"><span>الإجمالي</span><span>{total.toFixed(2)}</span></div>
      </div>
      <div className="space-y-1.5"><Label>ملاحظات إضافية</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <DialogFooter><Button type="submit" disabled={loading || (itemsTotal === 0)} className="bg-gradient-primary shadow-pop">{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إنشاء الطلب</Button></DialogFooter>
    </form>
  );
}
