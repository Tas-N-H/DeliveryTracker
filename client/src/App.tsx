import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import Dashboard from "@/pages/dashboard";
import Landing from "@/pages/landing";
import RestaurantLogin from "@/pages/restaurant-login";
import RestaurantDashboard from "@/pages/restaurant-dashboard-placeholder";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {/* ── Restaurant routes — bypasses Replit auth entirely ── */}
      <Route path="/:restaurantSlug/login" component={RestaurantLogin} />
      <Route path="/:restaurantSlug/dashboard" component={RestaurantDashboard} />

      {/* ── Main app routes — protected by Replit auth ── */}
      <Route>
        {isLoading ? (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-gray-500">Loading…</div>
          </div>
        ) : !isAuthenticated ? (
          <Landing />
        ) : (
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route component={NotFound} />
          </Switch>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
