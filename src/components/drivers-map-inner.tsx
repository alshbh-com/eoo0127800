import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import type { MapDriver } from "./drivers-map";

// Custom truck/scooter icon (SVG inlined)
const truckIcon = L.divIcon({
  className: "",
  html: `<div style="background:linear-gradient(135deg,#f97316,#ef4444);width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.3);border:3px solid white">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M3 17V6h11v11M14 9h4l3 4v4h-3"/></svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});
const offlineIcon = L.divIcon({
  className: "",
  html: `<div style="background:#94a3b8;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.2);border:2px solid white;opacity:.7">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M3 17V6h11v11M14 9h4l3 4v4h-3"/></svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Re-fit when drivers change
function FitBounds({ drivers }: { drivers: MapDriver[] }) {
  const map = useMap();
  useEffect(() => {
    if (drivers.length === 0) return;
    if (drivers.length === 1) {
      map.setView([drivers[0].lat, drivers[0].lng], 14, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(drivers.map((d) => [d.lat, d.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [drivers, map]);
  return null;
}

export default function DriversMapInner({ drivers }: { drivers: MapDriver[] }) {
  // Egypt center (Cairo)
  const center = useMemo<[number, number]>(() => [30.0444, 31.2357], []);

  return (
    <div className="h-[480px] w-full overflow-hidden rounded-lg border border-border shadow-soft">
      <MapContainer center={center} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom={true}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <FitBounds drivers={drivers} />
        {drivers.map((d) => (
          <Marker key={d.id} position={[d.lat, d.lng]} icon={d.online ? truckIcon : offlineIcon}>
            <Popup>
              <div className="text-sm" dir="rtl">
                <div className="font-bold mb-1">{d.label}</div>
                <div className={d.online ? "text-green-600 font-semibold" : "text-gray-500"}>
                  {d.online ? "🟢 متصل - يتحرك مباشرة" : "⚪ غير متصل"}
                </div>
                <div className="text-xs text-gray-500 mt-1" dir="ltr">{d.lat.toFixed(5)}, {d.lng.toFixed(5)}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
