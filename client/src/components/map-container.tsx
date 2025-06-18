import { useEffect, useRef } from "react";
import { Crosshair, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Order } from "@shared/schema";

// Import Leaflet dynamically to avoid SSR issues
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

export function MapContainer({ orders, selectedOrderId, onOrderSelect }: MapContainerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<number, any>>(new Map());

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    // Load Leaflet CSS and JS
    const loadLeaflet = async () => {
      if (!window.L) {
        // Load Leaflet CSS
        const cssLink = document.createElement("link");
        cssLink.rel = "stylesheet";
        cssLink.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(cssLink);

        // Load Leaflet JS
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        await new Promise((resolve) => {
          script.onload = resolve;
          document.head.appendChild(script);
        });
      }

      // Initialize map centered on Medway, UK
      mapInstanceRef.current = window.L.map(mapRef.current).setView([51.4, 0.55], 12);

      // Add OpenStreetMap tiles
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap contributors',
      }).addTo(mapInstanceRef.current);
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update markers when orders change
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => {
      mapInstanceRef.current.removeLayer(marker);
    });
    markersRef.current.clear();

    // Add markers for orders with coordinates
    orders.forEach((order) => {
      if (order.latitude && order.longitude) {
        const lat = parseFloat(order.latitude);
        const lng = parseFloat(order.longitude);

        const color = order.status === "pending" ? "#F44336" : "#FF9800";
        const isSelected = selectedOrderId === order.id;

        const marker = window.L.circleMarker([lat, lng], {
          radius: isSelected ? 12 : 10,
          fillColor: color,
          color: "#fff",
          weight: isSelected ? 3 : 2,
          opacity: 1,
          fillOpacity: 0.8,
        }).addTo(mapInstanceRef.current);

        // Add popup
        const platformName = order.platform.replace("-", " ").toUpperCase();
        const statusName = order.status.replace("-", " ").toUpperCase();
        
        marker.bindPopup(`
          <div class="p-2">
            <div class="font-semibold text-sm mb-1">Order #${order.orderNumber}</div>
            <div class="text-xs text-gray-600 mb-2">${order.address}</div>
            <div class="text-xs text-gray-500 mb-2">${platformName}</div>
            <div class="text-xs">
              <span class="inline-block w-2 h-2 rounded-full mr-1" style="background-color: ${color}"></span>
              ${statusName}
            </div>
          </div>
        `);

        // Handle marker click
        marker.on("click", () => {
          onOrderSelect(order.id);
        });

        markersRef.current.set(order.id, marker);
      }
    });
  }, [orders, selectedOrderId, onOrderSelect]);

  // Center map on Medway
  const centerMap = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([51.4, 0.55], 12);
    }
  };

  // Refresh map
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
        <h3 className="font-semibold text-gray-800 text-sm mb-2">Delivery Status</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-red-500 mr-2"></div>
            <span className="text-gray-600">Pending</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-orange-500 mr-2"></div>
            <span className="text-gray-600">In Transit</span>
          </div>
        </div>
      </div>

      {/* Map container */}
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}
