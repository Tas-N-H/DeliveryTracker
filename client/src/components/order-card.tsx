import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Phone, Globe } from "lucide-react";
import { SiUbereats, SiJusteat } from "react-icons/si";
import type { Order } from "@shared/schema";

interface OrderCardProps {
  order: Order;
  isSelected: boolean;
  onSelect: () => void;
  onRefetch: () => void;
}

export function OrderCard({ order, isSelected, onSelect, onRefetch }: OrderCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const response = await apiRequest("PATCH", `/api/orders/${order.id}/status`, { status: newStatus });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      onRefetch();
      toast({
        title: "Order Updated",
        description: "Order status has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update order status.",
        variant: "destructive",
      });
      console.error("Error updating order status:", error);
    },
  });

  const markDeliveredMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/orders/${order.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      onRefetch();
      toast({
        title: "Order Delivered",
        description: "Order has been marked as delivered and removed from the map.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to mark order as delivered.",
        variant: "destructive",
      });
      console.error("Error marking order as delivered:", error);
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "cooking":
        return "bg-red-500";
      case "packed":
        return "bg-blue-500";
      case "in-transit":
        return "bg-orange-500";
      default:
        return "bg-gray-500";
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("en-UK", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatPlatform = (platform: string) => {
    switch (platform) {
      case "uber-eats":
        return "Uber Eats";
      case "just-eat":
        return "Just Eat";
      case "website":
        return "Website Order";
      case "phone":
        return "Phone Order";
      default:
        return platform;
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "uber-eats":
        return <SiUbereats className="w-4 h-4 text-black" />;
      case "just-eat":
        return <SiJusteat className="w-4 h-4 text-orange-500" />;
      case "website":
        return <Globe className="w-4 h-4 text-blue-500" />;
      case "phone":
        return <Phone className="w-4 h-4 text-green-500" />;
      default:
        return <Globe className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div 
      className={`order-card bg-white rounded-lg shadow-sm border p-4 cursor-pointer transition-all
        ${isSelected ? "border-primary ring-2 ring-primary/20" : "border-gray-200 hover:shadow-md"}
      `}
      onClick={onSelect}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center">
          <span className={`inline-block w-3 h-3 rounded-full mr-2 ${getStatusColor(order.status)}`}></span>
          {getPlatformIcon(order.platform)}
          <span className="text-xs font-medium text-gray-500 ml-2">Order #{order.orderNumber}</span>
        </div>
        <span className="text-xs text-gray-400">{formatTime(order.createdAt)}</span>
      </div>
      
      <p className="text-sm font-medium text-gray-800 mb-1">{order.address}</p>
      <p className="text-xs text-gray-500 mb-3">{formatPlatform(order.platform)}</p>
      
      <div className="flex space-x-2 flex-wrap">
        {order.status === "cooking" && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs bg-blue-500 text-white border-blue-500 hover:bg-blue-600"
            onClick={(e) => {
              e.stopPropagation();
              updateStatusMutation.mutate("packed");
            }}
            disabled={updateStatusMutation.isPending}
          >
            Mark Packed
          </Button>
        )}

        {order.status === "packed" && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs bg-orange-500 text-white border-orange-500 hover:bg-orange-600"
            onClick={(e) => {
              e.stopPropagation();
              updateStatusMutation.mutate("in-transit");
            }}
            disabled={updateStatusMutation.isPending}
          >
            Out for Delivery
          </Button>
        )}
        
        {order.status === "in-transit" && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs bg-green-500 text-white border-green-500 hover:bg-green-600"
            onClick={(e) => {
              e.stopPropagation();
              markDeliveredMutation.mutate();
            }}
            disabled={markDeliveredMutation.isPending}
          >
            Mark Delivered
          </Button>
        )}
      </div>
    </div>
  );
}
