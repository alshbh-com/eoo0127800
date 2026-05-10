import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { phoneToEmail } from "@/lib/phone-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(phoneToEmail(phone), password);
      const { data: anyAdmin } = await supabase.from("user_roles").select("id").eq("role", "admin").limit(1);
      if (!anyAdmin || anyAdmin.length === 0) {
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          await supabase.from("user_roles").insert({ user_id: u.user.id, role: "admin" });
          toast.success("تم تعيينك كمسؤول (أول مستخدم)");
        }
      }
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-2xl font-extrabold">
            O&amp;R
          </div>
          <h1 className="text-3xl font-bold tracking-tight">O&amp;R</h1>
          <p className="mt-1 text-sm text-muted-foreground">منصة إدارة الدليفري والمطاعم</p>
        </div>

        <Card className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input id="phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xxxxxxxx" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              دخول
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            ليس لديك حساب؟ <Link to="/signup" className="text-primary hover:underline">إنشاء حساب</Link>
          </p>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          أول مستخدم يسجل يتم تعيينه كمسؤول النظام تلقائيًا.
        </p>
      </div>
    </div>
  );
}
