import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Truck } from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: AppGuard,
});

function AppGuard() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Truck className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  return <Outlet />;
}
