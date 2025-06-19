import { createContext, useContext, useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

interface Restaurant {
  id: number;
  name: string;
  email: string;
  address?: string;
  phone?: string;
}

interface AuthContextType {
  restaurant: Restaurant | null;
  token: string | null;
  login: (token: string, restaurant: Restaurant) => void;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing token in localStorage
    const savedToken = localStorage.getItem("auth_token");
    if (savedToken) {
      validateToken(savedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const validateToken = async (authToken: string) => {
    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          "Authorization": `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const restaurantData = await response.json();
        setRestaurant(restaurantData);
        setToken(authToken);
      } else {
        // Token is invalid, remove it
        localStorage.removeItem("auth_token");
      }
    } catch (error) {
      console.error("Token validation failed:", error);
      localStorage.removeItem("auth_token");
    } finally {
      setIsLoading(false);
    }
  };

  const login = (authToken: string, restaurantData: Restaurant) => {
    localStorage.setItem("auth_token", authToken);
    setToken(authToken);
    setRestaurant(restaurantData);
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    setToken(null);
    setRestaurant(null);
  };

  const value = {
    restaurant,
    token,
    login,
    logout,
    isLoading,
    isAuthenticated: !!restaurant,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}