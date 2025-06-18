import { Button } from "@/components/ui/button";
import { OrderCard } from "@/components/order-card";
import { Plus, Camera, BarChart3 } from "lucide-react";
import type { Order } from "@shared/schema";

interface SidebarProps {
  orders: Order[];
  pendingCount: number;
  transitCount: number;
  deliveredCount: number;
  selectedOrderId: number | null;
  onOrderSelect: (id: number | null) => void;
  onAddOrder: () => void;
  onToggleMobileSidebar: () => void;
  onRefetch: () => void;
}

export function Sidebar({
  orders,
  pendingCount,
  transitCount,
  deliveredCount,
  selectedOrderId,
  onOrderSelect,
  onAddOrder,
  onToggleMobileSidebar,
  onRefetch,
}: SidebarProps) {
  return (
    <div className="w-full h-full bg-white shadow-lg flex flex-col border-r border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-primary text-white">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Delivery Manager</h1>
          <button 
            className="md:hidden text-white hover:bg-blue-700 p-2 rounded"
            onClick={onToggleMobileSidebar}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-blue-100 text-sm mt-1">Medway Takeaway Orders</p>
      </div>

      {/* Add Order Section */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <Button 
          onClick={onAddOrder}
          className="w-full bg-primary text-white hover:bg-blue-700 transition duration-200"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add New Order
        </Button>
      </div>

      {/* Status Summary */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center mb-3">
          <BarChart3 className="w-5 h-5 mr-2 text-gray-600" />
          <h2 className="font-semibold text-gray-800">Order Summary</h2>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
              <span className="text-sm text-gray-600">Pending</span>
            </div>
            <span className="text-sm font-medium text-gray-800">{pendingCount}</span>
          </div>
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
              <span className="text-sm text-gray-600">In Transit</span>
            </div>
            <span className="text-sm font-medium text-gray-800">{transitCount}</span>
          </div>
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
              <span className="text-sm text-gray-600">Delivered Today</span>
            </div>
            <span className="text-sm font-medium text-gray-800">{deliveredCount}</span>
          </div>
        </div>
      </div>

      {/* Active Orders List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Active Orders</h2>
          
          {orders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-sm">No active orders</div>
              <div className="text-xs mt-1">Add a new order to get started</div>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isSelected={selectedOrderId === order.id}
                  onSelect={() => onOrderSelect(order.id)}
                  onRefetch={onRefetch}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Receipt Scanner Button */}
      <div className="p-4 border-t border-gray-200">
        <Button 
          variant="outline"
          className="w-full"
          onClick={() => {
            // TODO: Implement receipt scanning functionality
            console.log("Receipt scanning not yet implemented");
          }}
        >
          <Camera className="w-4 h-4 mr-2" />
          Scan Receipt
        </Button>
      </div>
    </div>
  );
}
