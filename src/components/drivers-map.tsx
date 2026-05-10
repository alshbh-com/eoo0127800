import { lazy, Suspense, useEffect, useState } from "react";

export interface MapDriver {
  id: string;
  lat: number;
  lng: number;
  label: string;
  online: boolean;
}

const InnerMap = lazy(() => import("./drivers-map-inner"));

export function DriversMap({ drivers }: { drivers: MapDriver[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="flex h-[420px] items-center justify-center rounded-lg border border-border bg-muted text-sm text-muted-foreground">جاري تحميل الخريطة…</div>;
  }
  return (
    <Suspense fallback={<div className="flex h-[420px] items-center justify-center rounded-lg border border-border bg-muted text-sm text-muted-foreground">جاري التحميل…</div>}>
      <InnerMap drivers={drivers} />
    </Suspense>
  );
}
