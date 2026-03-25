import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, Package, Truck, BarChart3 } from "lucide-react";

export default function Landing() {
  useEffect(() => {
    document.title = "Delivery Manager - Takeaway Order Tracking";
  }, []);

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12 text-white">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="bg-white/20 rounded-lg p-2">
              <Truck className="w-6 h-6" />
            </div>
            <span className="text-xl font-semibold">Delivery Manager</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-6">
            Track every order,<br />from kitchen to door.
          </h1>
          <p className="text-blue-100 text-lg leading-relaxed max-w-sm">
            Real-time delivery tracking with an interactive map, OCR receipt scanning, and live order status for your takeaway business.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-white/10 rounded-xl p-4">
            <MapPin className="w-5 h-5 text-blue-200 shrink-0" />
            <span className="text-sm text-blue-100">Live map tracking for every delivery</span>
          </div>
          <div className="flex items-center gap-3 bg-white/10 rounded-xl p-4">
            <Package className="w-5 h-5 text-blue-200 shrink-0" />
            <span className="text-sm text-blue-100">Manage Uber Eats, Just Eat, and direct orders</span>
          </div>
          <div className="flex items-center gap-3 bg-white/10 rounded-xl p-4">
            <BarChart3 className="w-5 h-5 text-blue-200 shrink-0" />
            <span className="text-sm text-blue-100">Daily delivery stats at a glance</span>
          </div>
        </div>

        <p className="text-blue-200 text-sm">© 2025 Delivery Manager</p>
      </div>

      {/* Right panel — login */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-sm text-center">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center justify-center gap-2 mb-8">
            <div className="bg-primary rounded-lg p-2">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-gray-800">Delivery Manager</span>
          </div>

          <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome back</h2>
          <p className="text-gray-500 mb-10">Sign in to access your delivery dashboard.</p>

          <a href="/api/login" className="block">
            <Button className="w-full bg-primary hover:bg-primary/90 text-white h-12 text-base shadow-md shadow-primary/25">
              Sign in with Replit
            </Button>
          </a>

          <p className="mt-6 text-xs text-gray-400">
            Supports Google, GitHub, Apple and email login.
          </p>
        </div>
      </div>
    </div>
  );
}
