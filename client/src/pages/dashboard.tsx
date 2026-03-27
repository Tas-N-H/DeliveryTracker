import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/sidebar";
import { MapContainer } from "@/components/map-container";
import { AddOrderModal } from "@/components/add-order-modal";
import type { Order } from "@shared/schema";

export default function Dashboard() {
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectionKey, setSelectionKey] = useState(0);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Always increment selectionKey so re-clicking the same order re-triggers the map effect
  const handleOrderSelect = (id: number | null) => {
    setSelectedOrderId(id);
    setSelectionKey(k => k + 1);
  };

  const { data: orders = [], isLoading, refetch } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  // Filter active orders (not delivered)
  const activeOrders = orders.filter(order => order.status !== "delivered");
  
  // Count orders by status
  const cookingCount = activeOrders.filter(order => order.status === "cooking").length;
  const packedCount = activeOrders.filter(order => order.status === "packed").length;
  const transitCount = activeOrders.filter(order => order.status === "in-transit").length;

  // Get today's delivered orders count
  const { data: deliveredOrdersData = [] } = useQuery<any[]>({
    queryKey: ["/api/orders/delivered/today"],
  });
  const deliveredToday = deliveredOrdersData.length;

  useEffect(() => {
    document.title = "Delivery Manager - Takeaway Order Tracking";
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading orders...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile backdrop */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:relative z-50 md:z-0
        w-80 h-full transform transition-transform duration-300 ease-in-out
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar
          orders={activeOrders}
          cookingCount={cookingCount}
          packedCount={packedCount}
          transitCount={transitCount}
          deliveredCount={deliveredToday}
          selectedOrderId={selectedOrderId}
          onOrderSelect={handleOrderSelect}
          onAddOrder={() => setIsAddOrderModalOpen(true)}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          onRefetch={refetch}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 relative">
        {/* Mobile menu button */}
        <button
          className="md:hidden fixed top-4 left-4 z-30 bg-primary text-white p-2 rounded-lg shadow-lg"
          onClick={() => setIsMobileSidebarOpen(true)}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <MapContainer
          orders={activeOrders}
          selectedOrderId={selectedOrderId}
          selectionKey={selectionKey}
          onOrderSelect={handleOrderSelect}
        />
      </div>

      {/* Add Order Modal */}
      <AddOrderModal
        isOpen={isAddOrderModalOpen}
        onClose={() => setIsAddOrderModalOpen(false)}
        onSuccess={() => {
          refetch();
          setIsAddOrderModalOpen(false);
        }}
      />
    </div>
  );
}
