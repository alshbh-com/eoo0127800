import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth, primaryRole } from "@/hooks/use-auth";
import { Truck } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { loading, user, roles } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Truck className="h-10 w-10 animate-pulse text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  const role = primaryRole(roles);
  if (!role) return <Navigate to="/no-role" />;
  return <Navigate to={`/${role}`} />;
}
