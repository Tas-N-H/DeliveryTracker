import { useEffect } from "react";
import { useLocation } from "wouter";
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
  FormDescription,
} from "@/components/ui/form";
import { Loader2, UtensilsCrossed } from "lucide-react";

const setupSchema = z
  .object({
    restaurantName: z.string().min(1, "Restaurant name is required"),
    slug: z
      .string()
      .min(1, "URL slug is required")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Lowercase letters, numbers and hyphens only — e.g. china-village"
      ),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type SetupForm = z.infer<typeof setupSchema>;

export default function Setup() {
  const [, navigate] = useLocation();

  const { data: status, isLoading: checkingStatus } = useQuery<{ available: boolean }>({
    queryKey: ["/api/setup/status"],
    retry: false,
  });

  useEffect(() => {
    if (!checkingStatus && status && !status.available) {
      // Setup already done — send to root (which handles auth routing)
      navigate("/");
    }
  }, [checkingStatus, status, navigate]);

  const form = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      restaurantName: "",
      slug: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const setupMutation = useMutation({
    mutationFn: async (data: SetupForm) => {
      const res = await apiRequest("POST", "/api/setup", {
        restaurantName: data.restaurantName,
        slug: data.slug,
        email: data.email,
        password: data.password,
      });
      return res.json() as Promise<{ restaurantSlug: string }>;
    },
    onSuccess: ({ restaurantSlug }) => {
      navigate(`/${restaurantSlug}/dashboard`);
    },
    onError: (error: any) => {
      try {
        const body = JSON.parse(error.message.replace(/^\d+: /, ""));
        form.setError("root", { message: body.message ?? "Setup failed" });
      } catch {
        form.setError("root", { message: "Setup failed. Please try again." });
      }
    },
  });

  const onSubmit = (data: SetupForm) => {
    form.clearErrors("root");
    setupMutation.mutate(data);
  };

  // Auto-derive slug from restaurant name while the slug field is untouched
  const watchName = form.watch("restaurantName");
  const handleNameBlur = () => {
    if (!form.getValues("slug")) {
      const derived = watchName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      if (derived) form.setValue("slug", derived, { shouldValidate: true });
    }
  };

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // If setup is unavailable the useEffect will redirect; show nothing while that happens
  if (status && !status.available) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-900 mb-4">
            <UtensilsCrossed className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create your restaurant</h1>
          <p className="text-gray-500 text-sm mt-1">
            Set up your account to start managing deliveries
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              {/* Restaurant name */}
              <FormField
                control={form.control}
                name="restaurantName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700">Restaurant name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="China Village"
                        autoComplete="off"
                        {...field}
                        onBlur={() => { field.onBlur(); handleNameBlur(); }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Slug */}
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700">Restaurant URL</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <span className="inline-flex items-center px-3 h-10 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm select-none">
                          yourapp.com/
                        </span>
                        <Input
                          className="rounded-l-none"
                          placeholder="china-village"
                          autoComplete="off"
                          {...field}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, "")
                            )
                          }
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-xs">
                      Lowercase letters, numbers and hyphens only
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="border-t border-gray-100 pt-1" />

              {/* Owner email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700">Owner email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Password */}
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
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Confirm password */}
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700">Confirm password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Root error */}
              {form.formState.errors.root && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {form.formState.errors.root.message}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={setupMutation.isPending}
              >
                {setupMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating restaurant…
                  </>
                ) : (
                  "Create restaurant & continue"
                )}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          This page is only accessible until a restaurant has been created.
          Future staff accounts are managed from within the dashboard.
        </p>
      </div>
    </div>
  );
}
