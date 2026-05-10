import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/no-role")({
  component: NoRolePage,
});

function NoRolePage() {
  const { signOut, user } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">No role assigned</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account ({user?.email}) has no role yet. Ask an administrator to assign you a role.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={signOut} variant="secondary">Sign out</Button>
          <Button asChild><Link to="/">Retry</Link></Button>
        </div>
      </div>
    </div>
  );
}
