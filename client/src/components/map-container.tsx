import { useEffect, useRef } from "react";
import { Crosshair, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Order } from "@shared/schema";

declare global {
  interface Window { L: any; }
}

interface MapContainerProps {
  orders: Order[];
  selectedOrderId: number | null;
  onOrderSelect: (id: number | null) => void;
}

type MarkerMode = "normal" | "flashing" | "steady";

// ── Colour helpers ────────────────────────────────────────────────────────────
const statusColor = (status: string) => {
  switch (status) {
    case "cooking":    return "#F44336";
    case "packed":     return "#2196F3";
    case "in-transit": return "#FF9800";
    default:           return "#9E9E9E";
  }
};

// ── Icon builder: three visual modes ─────────────────────────────────────────
const buildIcon = (color: string, mode: MarkerMode) => {
  if (mode === "normal") {
    return window.L.divIcon({
      html: `<div style="position:relative;width:20px;height:20px;">
               <div class="marker-dot" style="background:${color};width:12px;height:12px;"></div>
             </div>`,
      className: "",
      iconSize:    [20, 20],
      iconAnchor:  [10, 10],
      popupAnchor: [0, -10],
    });
  }

  // flashing: rapidly expanding ring
  // steady: slow soft halo
  const ringClass = mode === "flashing" ? "marker-ring-flashing" : "marker-ring-steady";

  return window.L.divIcon({
    html: `<div style="position:relative;width:30px;height:30px;">
             <div class="${ringClass}" style="background:${color};"></div>
             <div class="marker-dot" style="background:${color};width:16px;height:16px;"></div>
           </div>`,
    className: "",
    iconSize:    [30, 30],
    iconAnchor:  [15, 15],
    popupAnchor: [0, -15],
  });
};

// ── Popup content ─────────────────────────────────────────────────────────────
const buildPopup = (order: Order, color: string) => `
  <div style="min-width:155px;padding:4px 2px;">
    <div style="font-weight:600;font-size:13px;margin-bottom:4px;">Order #${order.orderNumber}</div>
    <div style="font-size:11px;color:#555;margin-bottom:4px;">${order.address}</div>
    <div style="font-size:11px;color:#888;margin-bottom:4px;">${order.platform.replace("-"," ").toUpperCase()}</div>
    <div style="font-size:11px;display:flex;align-items:center;gap:4px;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>
      ${order.status.replace("-"," ").toUpperCase()}
    </div>
  </div>`;

// ── Component ─────────────────────────────────────────────────────────────────
export function MapContainer({ orders, selectedOrderId, onOrderSelect }: MapContainerProps) {
  const mapRef          = useRef<HTMLDivElement>(null);
  const mapInstanceRef  = useRef<any>(null);
  const markersRef      = useRef<Map<number, any>>(new Map());

  // Mutable refs so effects always see latest values without re-running
  const ordersRef       = useRef<Order[]>(orders);
  const selectedIdRef   = useRef<number | null>(selectedOrderId);
  const prevSelectedRef = useRef<number | null>(null);
  const flashTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  ordersRef.current   = orders;
  selectedIdRef.current = selectedOrderId;

  const { toast } = useToast();

  // ── Helper: set a marker's visual mode ──────────────────────────────────────
  const setMarkerMode = (id: number, mode: MarkerMode) => {
    const marker = markersRef.current.get(id);
    const order  = ordersRef.current.find(o => o.id === id);
    if (!marker || !order) return;
    marker.setIcon(buildIcon(statusColor(order.status), mode));
  };

  // ── Helper: clear the flash timer safely ────────────────────────────────────
  const clearFlashTimer = () => {
    if (flashTimerRef.current !== null) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
  };

  // ── Effect 1: initialise Leaflet map once ───────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    const init = async () => {
      if (!window.L) {
        const css    = document.createElement("link");
        css.rel      = "stylesheet";
        css.href     = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(css);

        const script = document.createElement("script");
        script.src   = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        await new Promise<void>(res => { script.onload = () => res(); document.head.appendChild(script); });
      }

      if (mapInstanceRef.current) return;
      mapInstanceRef.current = window.L.map(mapRef.current).setView([51.4, 0.55], 12);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(mapInstanceRef.current);
    };

    init();

    return () => {
      clearFlashTimer();
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect 2: sync markers whenever the orders list changes ─────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentIds = new Set(orders.map(o => o.id));

    // Remove stale markers
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });

    // Add or refresh markers
    orders.forEach(order => {
      if (!order.latitude || !order.longitude) return;
      const lat = parseFloat(order.latitude);
      const lng = parseFloat(order.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      // Determine current mode for this marker
      const isSelected  = selectedIdRef.current === order.id;
      const isFlashing  = isSelected && flashTimerRef.current !== null;
      const mode: MarkerMode = isSelected ? (isFlashing ? "flashing" : "steady") : "normal";
      const icon = buildIcon(statusColor(order.status), mode);

      if (markersRef.current.has(order.id)) {
        const marker = markersRef.current.get(order.id)!;
        marker.setIcon(icon);
        marker.getPopup()?.setContent(buildPopup(order, statusColor(order.status)));
      } else {
        const marker = window.L.marker([lat, lng], { icon }).addTo(map);
        marker.bindPopup(buildPopup(order, statusColor(order.status)));
        marker.on("click", () => onOrderSelect(order.id));
        markersRef.current.set(order.id, marker);
      }
    });
  }, [orders, onOrderSelect]);

  // ── Effect 3: handle selection changes — flyTo + flash lifecycle ─────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const prevId = prevSelectedRef.current;

    // ① Clear any running flash timer from the previous selection
    clearFlashTimer();

    // ② Restore the previously selected marker to normal
    if (prevId !== null && prevId !== selectedOrderId) {
      setMarkerMode(prevId, "normal");
      markersRef.current.get(prevId)?.closePopup();
    }

    // ③ Nothing selected — done
    if (selectedOrderId === null) {
      prevSelectedRef.current = null;
      return;
    }

    const order = ordersRef.current.find(o => o.id === selectedOrderId);

    // ④ No matching order
    if (!order) {
      prevSelectedRef.current = selectedOrderId;
      return;
    }

    // ⑤ No valid coordinates — notify and bail
    if (!order.latitude || !order.longitude) {
      toast({
        title: "No location data",
        description: `Order #${order.orderNumber} doesn't have coordinates yet.`,
        variant: "destructive",
      });
      prevSelectedRef.current = selectedOrderId;
      return;
    }

    const lat = parseFloat(order.latitude);
    const lng = parseFloat(order.longitude);
    if (isNaN(lat) || isNaN(lng)) {
      prevSelectedRef.current = selectedOrderId;
      return;
    }

    // ⑥ Start flashing the newly selected marker
    setMarkerMode(selectedOrderId, "flashing");
    markersRef.current.get(selectedOrderId)?.openPopup();

    // ⑦ After 5 s, transition to steady highlighted state
    flashTimerRef.current = setTimeout(() => {
      flashTimerRef.current = null;
      // Only update if this order is still selected
      if (selectedIdRef.current === selectedOrderId) {
        setMarkerMode(selectedOrderId, "steady");
      }
    }, 5000);

    // ⑧ Animate the map — skip if already focused on this order
    const isNewSelection = prevId !== selectedOrderId;
    if (isNewSelection) {
      const centre = map.getCenter();
      const alreadyFocused =
        Math.abs(centre.lat - lat) < 0.0005 &&
        Math.abs(centre.lng - lng) < 0.0005 &&
        map.getZoom() >= 15;

      if (!alreadyFocused) {
        map.flyTo([lat, lng], 16, { animate: true, duration: 0.7 });
      }
    }

    prevSelectedRef.current = selectedOrderId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrderId]);

  // ── Map control handlers ──────────────────────────────────────────────────
  const centerMap = () =>
    mapInstanceRef.current?.flyTo([51.4, 0.55], 12, { animate: true, duration: 0.6 });

  const refreshMap = () =>
    mapInstanceRef.current?.invalidateSize();

  return (
    <div className="relative w-full h-full">
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col space-y-2">
        <Button size="sm" variant="outline" className="w-10 h-10 bg-white shadow-lg p-0"
          onClick={centerMap} title="Centre on Medway">
          <Crosshair className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="outline" className="w-10 h-10 bg-white shadow-lg p-0"
          onClick={refreshMap} title="Refresh map">
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 bg-white rounded-lg shadow-lg p-4">
        <h3 className="font-semibold text-gray-800 text-sm mb-2">Order Status</h3>
        <div className="space-y-1 text-xs">
          {[["bg-red-500","Cooking"],["bg-blue-500","Packed"],["bg-orange-500","In Transit"]].map(([cls,label])=>(
            <div key={label} className="flex items-center">
              <div className={`w-3 h-3 rounded-full ${cls} mr-2`} />
              <span className="text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}
