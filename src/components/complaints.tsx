import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Complaint {
  id: string; subject: string; description: string | null; status: string;
  admin_notes: string | null; created_at: string; created_by: string;
  order_id: string | null; restaurant_id: string | null; driver_id: string | null;
}

const STATUS_AR: Record<string, string> = {
  open: "مفتوحة", in_progress: "قيد المعالجة", resolved: "تم الحل", rejected: "مرفوضة",
};
const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-500/15 text-red-600 border-red-300",
  in_progress: "bg-amber-500/15 text-amber-600 border-amber-300",
  resolved: "bg-green-500/15 text-green-600 border-green-300",
  rejected: "bg-gray-500/15 text-gray-600 border-gray-300",
};

export function ComplaintsList({ mode, restaurantId, driverId }: {
  mode: "admin" | "restaurant" | "driver";
  restaurantId?: string | null;
  driverId?: string | null;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<Complaint[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    let q = supabase.from("complaints").select("*").order("created_at", { ascending: false });
    if (mode === "restaurant" && restaurantId) q = q.eq("restaurant_id", restaurantId);
    if (mode === "driver" && driverId) q = q.eq("driver_id", driverId);
    const { data } = await q;
    if (data) setItems(data as Complaint[]);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("complaints-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "complaints" }, load)
      .subscribe();
    return () => { ch.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, restaurantId, driverId]);

  const counts = {
    open: items.filter((i) => i.status === "open").length,
    in_progress: items.filter((i) => i.status === "in_progress").length,
    resolved: items.filter((i) => i.status === "resolved").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Badge className="bg-red-500/15 text-red-600">مفتوحة: {counts.open}</Badge>
          <Badge className="bg-amber-500/15 text-amber-600">قيد المعالجة: {counts.in_progress}</Badge>
          <Badge className="bg-green-500/15 text-green-600">محلولة: {counts.resolved}</Badge>
        </div>
        {mode !== "admin" && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-warm shadow-pop"><Plus className="ml-2 h-4 w-4" />شكوى جديدة</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>تقديم شكوى</DialogTitle></DialogHeader>
              <ComplaintForm
                userId={user?.id ?? ""}
                restaurantId={restaurantId ?? null}
                driverId={driverId ?? null}
                onDone={() => { setOpen(false); load(); }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="p-5 shadow-soft">
        {items.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <AlertTriangle className="mx-auto h-10 w-10 mb-3 opacity-40" />
            لا توجد شكاوى
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الموضوع</TableHead>
                  <TableHead>الوصف</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>التاريخ</TableHead>
                  {mode === "admin" && <TableHead>إجراءات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.subject}</TableCell>
                    <TableCell className="max-w-xs text-sm text-muted-foreground">{c.description ?? "—"}</TableCell>
                    <TableCell><Badge className={STATUS_COLORS[c.status]}>{STATUS_AR[c.status] ?? c.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground" dir="ltr">{new Date(c.created_at).toLocaleString()}</TableCell>
                    {mode === "admin" && (
                      <TableCell><AdminComplaintActions complaint={c} onChange={load} /></TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ComplaintForm({ userId, restaurantId, driverId, onDone }: {
  userId: string; restaurantId: string | null; driverId: string | null; onDone: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    let order_id: string | null = null;
    if (orderNumber.trim()) {
      const { data } = await supabase.from("orders").select("id").eq("order_number", orderNumber.trim()).maybeSingle();
      if (data) order_id = data.id;
    }
    const { error } = await supabase.from("complaints").insert({
      created_by: userId, restaurant_id: restaurantId, driver_id: driverId,
      subject, description: description || null, order_id,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم إرسال الشكوى للأدمن");
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5"><Label>الموضوع</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="مثال: تأخر المندوب" /></div>
      <div className="space-y-1.5"><Label>التفاصيل</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="اشرح المشكلة..." rows={4} /></div>
      <div className="space-y-1.5"><Label>رقم الطلب (اختياري)</Label><Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="ORD-..." dir="ltr" /></div>
      <DialogFooter>
        <Button type="submit" disabled={loading} className="bg-gradient-primary shadow-pop">
          {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إرسال
        </Button>
      </DialogFooter>
    </form>
  );
}

function AdminComplaintActions({ complaint, onChange }: { complaint: Complaint; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(complaint.status);
  const [notes, setNotes] = useState(complaint.admin_notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const updates: Record<string, unknown> = { status, admin_notes: notes };
    if (status === "resolved") updates.resolved_at = new Date().toISOString();
    const { error } = await (supabase.from("complaints") as unknown as { update: (u: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } }).update(updates).eq("id", complaint.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم التحديث"); setOpen(false); onChange();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm">إدارة</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>إدارة الشكوى</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><div className="text-xs text-muted-foreground">الموضوع</div><div className="font-semibold">{complaint.subject}</div></div>
          {complaint.description && <div><div className="text-xs text-muted-foreground">التفاصيل</div><div className="text-sm">{complaint.description}</div></div>}
          <div className="space-y-1.5"><Label>الحالة</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_AR).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>ملاحظات الأدمن</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={saving}>{saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
