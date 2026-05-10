import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";
import type { MapDriver } from "./drivers-map";

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function DriversMapInner({ drivers }: { drivers: MapDriver[] }) {
  const center = useMemo<[number, number]>(() => {
    if (drivers.length === 0) return [31.95, 35.93];
    const avgLat = drivers.reduce((s, d) => s + d.lat, 0) / drivers.length;
    const avgLng = drivers.reduce((s, d) => s + d.lng, 0) / drivers.length;
    return [avgLat, avgLng];
  }, [drivers]);

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-lg border border-border">
      <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {drivers.map((d) => (
          <Marker key={d.id} position={[d.lat, d.lng]} icon={icon}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{d.label}</div>
                <div className={d.online ? "text-green-600" : "text-gray-500"}>
                  {d.online ? "متصل" : "غير متصل"}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
