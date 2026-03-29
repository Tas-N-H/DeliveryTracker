import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RestaurantSession {
  userId: number;
  role: string;
  restaurantId: number;
  restaurantSlug: string;
}

export default function RestaurantDashboardPlaceholder() {
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>();
  const [, navigate] = useLocation();

  const { data: session, isLoading } = useQuery<RestaurantSession>({
    queryKey: ["/api", restaurantSlug, "me"],
    queryFn: async () => {
      const res = await fetch(`/api/${restaurantSlug}/me`);
      if (!res.ok) throw new Error("Unauthorized");
      return res.json();
    },
    retry: false,
  });

  const handleLogout = async () => {
    await apiRequest("POST", `/api/${restaurantSlug}/logout`, {});
    navigate(`/${restaurantSlug}/login`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!session) {
    navigate(`/${restaurantSlug}/login`);
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm w-full">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-900 mb-4">
          <UtensilsCrossed className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
        <p className="text-gray-500 text-sm mb-6">
          Logged in as <span className="font-medium text-gray-700">{session.role}</span>
          {" "}· restaurant #{session.restaurantId}
        </p>
        <div className="bg-white border border-gray-200 rounded-2xl p-6 text-sm text-gray-500 mb-6">
          Dashboard coming soon.
        </div>
        <Button variant="outline" className="w-full" onClick={handleLogout}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
