import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { phoneToEmail, normalizePhone } from "@/lib/phone-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const normalized = normalizePhone(phone);
      if (normalized.length < 6) throw new Error("رقم الهاتف غير صحيح");
      const { error } = await supabase.auth.signUp({
        email: phoneToEmail(normalized),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { full_name: fullName, phone: normalized },
        },
      });
      if (error) throw error;
      toast.success("تم إنشاء الحساب");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إنشاء الحساب");
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
          <h1 className="text-3xl font-bold tracking-tight">إنشاء حساب</h1>
        </div>
        <Card className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">الاسم الكامل</Label>
              <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input id="phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xxxxxxxx" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              إنشاء الحساب
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            لديك حساب بالفعل؟ <Link to="/login" className="text-primary hover:underline">تسجيل الدخول</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
