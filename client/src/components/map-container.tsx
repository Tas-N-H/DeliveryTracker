import { useEffect, useRef } from "react";
import { Crosshair, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Order } from "@shared/schema";

declare global {
  interface Window {
    L: any;
  }
}

interface MapContainerProps {
  orders: Order[];
  selectedOrderId: number | null;
  onOrderSelect: (id: number | null) => void;
}

const getMarkerColor = (status: string) => {
  switch (status) {
    case "cooking":    return "#F44336";
    case "packed":     return "#2196F3";
    case "in-transit": return "#FF9800";
    default:           return "#9E9E9E";
  }
};

const buildIcon = (color: string, selected: boolean) => {
  if (selected) {
    return window.L.divIcon({
      html: `
        <div style="position:relative;width:30px;height:30px;">
          <div class="marker-pulse-ring" style="background-color:${color};"></div>
          <div class="marker-dot" style="background-color:${color};width:16px;height:16px;"></div>
        </div>`,
      className: "",
      iconSize:   [30, 30],
      iconAnchor: [15, 15],
      popupAnchor:[0, -15],
    });
  }
  return window.L.divIcon({
    html: `
      <div style="position:relative;width:20px;height:20px;">
        <div class="marker-dot" style="background-color:${color};width:12px;height:12px;"></div>
      </div>`,
    className: "",
    iconSize:   [20, 20],
    iconAnchor: [10, 10],
    popupAnchor:[0, -10],
  });
};

const buildPopup = (order: Order, color: string) => {
  const platformName = order.platform.replace("-", " ").toUpperCase();
  const statusName   = order.status.replace("-", " ").toUpperCase();
  return `
    <div style="min-width:150px;padding:4px 2px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:4px;">Order #${order.orderNumber}</div>
      <div style="font-size:11px;color:#555;margin-bottom:4px;">${order.address}</div>
      <div style="font-size:11px;color:#888;margin-bottom:4px;">${platformName}</div>
      <div style="font-size:11px;display:flex;align-items:center;gap:4px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>
        ${statusName}
      </div>
    </div>`;
};

export function MapContainer({ orders, selectedOrderId, onOrderSelect }: MapContainerProps) {
  const mapRef           = useRef<HTMLDivElement>(null);
  const mapInstanceRef   = useRef<any>(null);
  const markersRef       = useRef<Map<number, any>>(new Map());
  const ordersRef        = useRef<Order[]>(orders);
  const selectedIdRef    = useRef<number | null>(selectedOrderId);
  const prevSelectedRef  = useRef<number | null>(null);
  const { toast } = useToast();

  // Keep refs in sync with latest props (no re-render needed)
  ordersRef.current   = orders;
  selectedIdRef.current = selectedOrderId;

  // ── Effect 1: initialise the map once ──────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    const init = async () => {
      if (!window.L) {
        const css = document.createElement("link");
        css.rel  = "stylesheet";
        css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(css);

        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        await new Promise<void>((res) => { script.onload = () => res(); document.head.appendChild(script); });
      }

      if (mapInstanceRef.current) return;
      mapInstanceRef.current = window.L.map(mapRef.current).setView([51.4, 0.55], 12);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(mapInstanceRef.current);
    };

    init();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // ── Effect 2: sync markers when orders change ──────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentIds = new Set(orders.map((o) => o.id));

    // Remove markers for orders that no longer exist
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });

    // Add or update markers for current orders
    orders.forEach((order) => {
      if (!order.latitude || !order.longitude) return;
      const lat = parseFloat(order.latitude);
      const lng = parseFloat(order.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const isSelected = selectedIdRef.current === order.id;
      const color      = getMarkerColor(order.status);
      const icon       = buildIcon(color, isSelected);

      if (markersRef.current.has(order.id)) {
        const marker = markersRef.current.get(order.id)!;
        marker.setIcon(icon);
        marker.getPopup()?.setContent(buildPopup(order, color));
      } else {
        const marker = window.L.marker([lat, lng], { icon }).addTo(map);
        marker.bindPopup(buildPopup(order, color));
        marker.on("click", () => onOrderSelect(order.id));
        markersRef.current.set(order.id, marker);
      }
    });
  }, [orders, onOrderSelect]);

  // ── Effect 3: handle selection — update icons + flyTo ─────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Restore previous marker to normal style
    const prevId = prevSelectedRef.current;
    if (prevId !== null && prevId !== selectedOrderId) {
      const prevMarker = markersRef.current.get(prevId);
      const prevOrder  = ordersRef.current.find((o) => o.id === prevId);
      if (prevMarker && prevOrder) {
        prevMarker.setIcon(buildIcon(getMarkerColor(prevOrder.status), false));
        prevMarker.closePopup();
      }
    }

    // Apply selected style + flyTo
    if (selectedOrderId !== null) {
      const order  = ordersRef.current.find((o) => o.id === selectedOrderId);
      const marker = markersRef.current.get(selectedOrderId);

      if (!order) {
        prevSelectedRef.current = selectedOrderId;
        return;
      }

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

      if (marker) {
        marker.setIcon(buildIcon(getMarkerColor(order.status), true));
        marker.openPopup();
      }

      // Only animate if this is a new selection
      if (prevId !== selectedOrderId) {
        const currentCenter = map.getCenter();
        const alreadyThere  =
          Math.abs(currentCenter.lat - lat) < 0.0005 &&
          Math.abs(currentCenter.lng - lng) < 0.0005 &&
          map.getZoom() >= 15;

        if (!alreadyThere) {
          map.flyTo([lat, lng], 16, { animate: true, duration: 0.7 });
        }
      }
    }

    prevSelectedRef.current = selectedOrderId;
  }, [selectedOrderId, toast]);

  const centerMap = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([51.4, 0.55], 12, { animate: true, duration: 0.6 });
    }
  };

  const refreshMap = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.invalidateSize();
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Map Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col space-y-2">
        <Button
          size="sm"
          variant="outline"
          className="w-10 h-10 bg-white shadow-lg p-0"
          onClick={centerMap}
          title="Center on Medway"
        >
          <Crosshair className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-10 h-10 bg-white shadow-lg p-0"
          onClick={refreshMap}
          title="Refresh map"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 z-10 bg-white rounded-lg shadow-lg p-4">
        <h3 className="font-semibold text-gray-800 text-sm mb-2">Order Status</h3>
        <div className="space-y-1 text-xs">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
            <span className="text-gray-600">Cooking</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
            <span className="text-gray-600">Packed</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
            <span className="text-gray-600">In Transit</span>
          </div>
        </div>
      </div>

      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}
