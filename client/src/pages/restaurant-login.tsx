import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2, UtensilsCrossed } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function RestaurantLogin() {
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>();
  const [, navigate] = useLocation();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check whether this restaurant exists
  const { data: restaurantCheck, isLoading: checkingRestaurant } = useQuery<
    { exists: boolean; name: string } | { message: string }
  >({
    queryKey: ["/api", restaurantSlug, "me"],
    queryFn: async () => {
      const res = await fetch(`/api/${restaurantSlug}/me`);
      // If already logged in, redirect immediately
      if (res.ok) {
        navigate(`/${restaurantSlug}/dashboard`);
        return { exists: true, name: "" };
      }
      // 401 is expected when not logged in — just means the route exists
      if (res.status === 401) {
        return { exists: true, name: "" };
      }
      return res.json();
    },
    retry: false,
  });

  // Separately verify the restaurant exists in the DB
  const { data: restaurantInfo, isLoading: loadingRestaurant } = useQuery<
    { name: string; slug: string } | null
  >({
    queryKey: ["/api/restaurant-check", restaurantSlug],
    queryFn: async () => {
      const res = await fetch(`/api/${restaurantSlug}/info`);
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      const res = await apiRequest("POST", `/api/${restaurantSlug}/login`, {
        email: data.email,
        password: data.password,
      });
      return res.json();
    },
    onSuccess: () => {
      navigate(`/${restaurantSlug}/dashboard`);
    },
    onError: async (error: any) => {
      try {
        const body = JSON.parse(error.message || "{}");
        setErrorMsg(body.message ?? "Unauthorised access");
      } catch {
        setErrorMsg("Unauthorised access");
      }
    },
  });

  const onSubmit = (data: LoginForm) => {
    setErrorMsg(null);
    loginMutation.mutate(data);
  };

  // Still loading
  if (checkingRestaurant || loadingRestaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // Restaurant not found
  if (restaurantInfo === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <UtensilsCrossed className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h1 className="text-xl font-semibold text-gray-700">Restaurant not found</h1>
          <p className="text-gray-500 mt-1 text-sm">
            No restaurant with the address <span className="font-mono">/{restaurantSlug}</span> exists.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-900 mb-4">
            <UtensilsCrossed className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {restaurantInfo?.name ?? restaurantSlug}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to manage your deliveries</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700">Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700">Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {errorMsg && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {errorMsg}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
