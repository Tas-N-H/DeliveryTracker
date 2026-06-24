import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapContainer } from "@/components/map-container";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus,
  LogOut,
  MapPin,
  Navigation,
  ChefHat,
  Package,
  Truck,
  CheckCircle2,
  BarChart3,
  UtensilsCrossed,
  Loader2,
  Users,
  Settings,
  Trash2,
  ShieldCheck,
  UserCircle,
  Save,
  History,
  User,
} from "lucide-react";
import { SiUbereats, SiJusteat } from "react-icons/si";
import type { Order, DeliveredOrder } from "@shared/schema";

type DeliveredOrderWithDriver = DeliveredOrder & { driverEmail: string | null };

// ── Types ─────────────────────────────────────────────────────────────────────

interface RestaurantSession {
  userId: number;
  role: string;
  restaurantId: number;
  restaurantSlug: string;
}

interface ActiveDriver {
  driverId: number;
  email: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; bgClass: string; dotClass: string; label: string }> = {
  cooking:    { color: "#F44336", bgClass: "bg-red-100 text-red-700",    dotClass: "bg-red-500",    label: "Cooking"    },
  packed:     { color: "#2196F3", bgClass: "bg-blue-100 text-blue-700",  dotClass: "bg-blue-500",   label: "Packed"     },
  "in-transit": { color: "#FF9800", bgClass: "bg-orange-100 text-orange-700", dotClass: "bg-orange-500", label: "In Transit" },
  delivered:  { color: "#4CAF50", bgClass: "bg-green-100 text-green-700", dotClass: "bg-green-500", label: "Delivered"  },
};

function formatPlatform(p: string) {
  switch (p) {
    case "uber-eats": return "Uber Eats";
    case "just-eat":  return "Just Eat";
    case "phone":     return "Phone Order";
    case "website":   return "Website";
    case "direct":    return "Direct";
    default:          return p;
  }
}

function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case "uber-eats": return <SiUbereats className="w-4 h-4 text-black shrink-0" />;
    case "just-eat":  return <SiJusteat className="w-4 h-4 text-orange-500 shrink-0" />;
    default:          return <UtensilsCrossed className="w-4 h-4 text-gray-400 shrink-0" />;
  }
}

// ── Add Order Modal ───────────────────────────────────────────────────────────

const addOrderSchema = z.object({
  orderNumber: z.string().min(1, "Order number is required"),
  address: z.string()
    .min(10, "Enter a complete address with postcode")
    .refine(a => /([A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][ABD-HJLNP-UW-Z]{2})/i.test(a), {
      message: "Address must include a valid UK postcode (e.g. ME4 4EZ)",
    }),
  platform: z.string().min(1, "Platform is required"),
  status: z.string().default("cooking"),
  latitude: z.string().optional().default(""),
  longitude: z.string().optional().default(""),
});

type AddOrderForm = z.infer<typeof addOrderSchema>;

function AddOrderModal({
  open,
  onClose,
  restaurantSlug,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  restaurantSlug: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [isGeocoding, setIsGeocoding] = useState(false);

  const form = useForm<AddOrderForm>({
    resolver: zodResolver(addOrderSchema),
    defaultValues: {
      orderNumber: "",
      address: "",
      platform: "",
      status: "cooking",
      latitude: "",
      longitude: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AddOrderForm) => {
      setIsGeocoding(true);
      try {
        const geoRes = await apiRequest("POST", `/api/${restaurantSlug}/geocode`, { address: data.address });
        const coords = await geoRes.json();
        const res = await apiRequest("POST", `/api/${restaurantSlug}/orders`, {
          ...data,
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        return res.json();
      } finally {
        setIsGeocoding(false);
      }
    },
    onSuccess: () => {
      toast({ title: "Order added", description: "New order added to the map." });
      form.reset();
      onSuccess();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add order.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={() => { form.reset(); onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Order</DialogTitle>
          <DialogDescription>Enter the order details to add it to the delivery map</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
            <FormField control={form.control} name="orderNumber" render={({ field }) => (
              <FormItem>
                <FormLabel>Order Number</FormLabel>
                <FormControl><Input placeholder="e.g. UE2024013" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>Delivery Address</FormLabel>
                <FormControl>
                  <Textarea placeholder="Full address with postcode, e.g. 12 High Street, London SW1A 1AA" rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="platform" render={({ field }) => (
              <FormItem>
                <FormLabel>Platform</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="uber-eats">Uber Eats</SelectItem>
                    <SelectItem value="just-eat">Just Eat</SelectItem>
                    <SelectItem value="direct">Direct</SelectItem>
                    <SelectItem value="phone">Phone Order</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { form.reset(); onClose(); }}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={createMutation.isPending || isGeocoding}>
                {isGeocoding ? "Locating…" : createMutation.isPending ? "Adding…" : "Add Order"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Staff Order Card ──────────────────────────────────────────────────────────

function StaffOrderCard({
  order,
  drivers,
  restaurantSlug,
  isSelected,
  onSelect,
  onRefetch,
}: {
  order: Order;
  drivers: ActiveDriver[];
  restaurantSlug: string;
  isSelected: boolean;
  onSelect: () => void;
  onRefetch: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG["cooking"];

  const [pendingDriver, setPendingDriver] = useState<string>(
    order.assignedDriverId?.toString() ?? ""
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/${restaurantSlug}/orders`] });
    queryClient.invalidateQueries({ queryKey: [`/api/${restaurantSlug}/orders/delivered/today`] });
    onRefetch();
  };

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest("PATCH", `/api/${restaurantSlug}/orders/${order.id}/status`, { status }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Status updated" }); invalidate(); },
    onError: () => toast({ title: "Error", description: "Failed to update status.", variant: "destructive" }),
  });

  const deliveredMutation = useMutation({
    mutationFn: () =>
      apiRequest("DELETE", `/api/${restaurantSlug}/orders/${order.id}`),
    onSuccess: () => { toast({ title: "Order delivered", description: "Order marked as delivered." }); invalidate(); },
    onError: () => toast({ title: "Error", description: "Failed to mark as delivered.", variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: (driverId: number | null) =>
      apiRequest("POST", `/api/${restaurantSlug}/orders/${order.id}/assign`, { driverId }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Driver assigned" }); invalidate(); },
    onError: () => toast({ title: "Error", description: "Failed to assign driver.", variant: "destructive" }),
  });

  const currentDriverId = order.assignedDriverId?.toString() ?? "";
  const assignedDriver = drivers.find(d => d.driverId === order.assignedDriverId);
  const pendingChanged = pendingDriver !== currentDriverId;

  return (
    <div
      onClick={onSelect}
      className={`rounded-lg border p-3 cursor-pointer transition-all bg-white ${
        isSelected ? "border-blue-500 ring-2 ring-blue-200 shadow-md" : "border-gray-200 hover:shadow-sm"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className={`w-2.5 h-2.5 rounded-full ${cfg.dotClass} shrink-0`} />
          <PlatformIcon platform={order.platform} />
          <span className="text-xs font-semibold text-gray-700">#{order.orderNumber}</span>
        </div>
        <Badge variant="outline" className={`text-xs px-1.5 py-0 ${cfg.bgClass} border-0`}>
          {cfg.label}
        </Badge>
      </div>

      {/* Address & platform */}
      <p className="text-sm font-medium text-gray-800 leading-snug mb-0.5 line-clamp-2">{order.address}</p>
      <p className="text-xs text-gray-500 mb-2">{formatPlatform(order.platform)}</p>

      {/* Status action buttons */}
      <div className="flex flex-wrap gap-1.5 mb-2" onClick={e => e.stopPropagation()}>
        {order.status === "cooking" && (
          <Button size="sm" className="h-7 text-xs bg-blue-500 hover:bg-blue-600 text-white border-0"
            onClick={() => statusMutation.mutate("packed")}
            disabled={statusMutation.isPending}>
            Mark Packed
          </Button>
        )}
        {order.status === "packed" && (
          <Button size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white border-0"
            onClick={() => statusMutation.mutate("in-transit")}
            disabled={statusMutation.isPending}>
            Out for Delivery
          </Button>
        )}
        {order.status === "in-transit" && (
          <Button size="sm" className="h-7 text-xs bg-green-500 hover:bg-green-600 text-white border-0"
            onClick={() => deliveredMutation.mutate()}
            disabled={deliveredMutation.isPending}>
            Mark Delivered
          </Button>
        )}
      </div>

      {/* Assign driver */}
      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        {drivers.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No active drivers</p>
        ) : (
          <>
            <Select value={pendingDriver} onValueChange={setPendingDriver}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="Assign driver…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {drivers.map(d => (
                  <SelectItem key={d.driverId} value={d.driverId.toString()}>
                    {d.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pendingChanged && (
              <Button
                size="sm"
                className="h-7 text-xs shrink-0"
                disabled={assignMutation.isPending}
                onClick={() => {
                  const id = pendingDriver === "none" ? null : parseInt(pendingDriver);
                  assignMutation.mutate(id);
                }}
              >
                {assignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Assign"}
              </Button>
            )}
          </>
        )}
      </div>
      {assignedDriver && !pendingChanged && (
        <p className="text-xs text-gray-500 mt-1">
          <span className="text-gray-400">Driver:</span> {assignedDriver.email}
        </p>
      )}
    </div>
  );
}

// ── Manage Staff Tab ──────────────────────────────────────────────────────────

interface StaffMember {
  userId: number;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
}

const ROLE_COLOURS: Record<string, string> = {
  owner:    "bg-purple-100 text-purple-700",
  manager:  "bg-blue-100 text-blue-700",
  employee: "bg-gray-100 text-gray-600",
  driver:   "bg-orange-100 text-orange-700",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner", manager: "Manager", employee: "Employee", driver: "Driver",
};

function formatMemberDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const addStaffSchema = z.object({
  name:            z.string().min(1, "Name is required").max(100),
  email:           z.string().email("Enter a valid email"),
  password:        z.string().min(8, "Minimum 8 characters"),
  confirmPassword: z.string(),
  role:            z.enum(["manager", "employee", "driver"], { required_error: "Select a role" }),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path:    ["confirmPassword"],
});
type AddStaffForm = z.infer<typeof addStaffSchema>;

// Per-row role editor component
function RoleEditor({
  member,
  sessionRole,
  sessionUserId,
  restaurantSlug,
}: {
  member: StaffMember;
  sessionRole: string;
  sessionUserId: number;
  restaurantSlug: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingRole, setPendingRole] = useState(member.role);
  const changed = pendingRole !== member.role;

  const roleMutation = useMutation({
    mutationFn: (role: string) =>
      apiRequest("PATCH", `/api/${restaurantSlug}/staff/${member.userId}/role`, { role }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Role updated" });
      queryClient.invalidateQueries({ queryKey: [`/api/${restaurantSlug}/staff`] });
    },
    onError: async (err: any) => {
      setPendingRole(member.role);
      const body = err?.response ? await err.response.json().catch(() => ({})) : {};
      toast({ title: "Error", description: body.message ?? "Failed to update role", variant: "destructive" });
    },
  });

  // Determine which roles this editor can show
  const isOwner       = member.role === "owner";
  const isSelf        = member.userId === sessionUserId;
  const isTargetMgr   = member.role === "manager";

  // Owner can change non-owner, non-self; manager can change employee↔driver only
  const canEdit =
    !isOwner &&
    !isSelf &&
    (sessionRole === "owner" || (sessionRole === "manager" && !isTargetMgr));

  if (!canEdit) {
    return (
      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLOURS[member.role] ?? "bg-gray-100 text-gray-600"}`}>
        {ROLE_LABELS[member.role] ?? member.role}
      </span>
    );
  }

  const roleOptions =
    sessionRole === "owner"
      ? ["manager", "employee", "driver"]
      : ["employee", "driver"];

  return (
    <div className="flex items-center gap-1.5">
      <Select value={pendingRole} onValueChange={setPendingRole}>
        <SelectTrigger className="h-6 text-xs w-28 px-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roleOptions.map(r => (
            <SelectItem key={r} value={r} className="text-xs">{ROLE_LABELS[r]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {changed && (
        <Button
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={roleMutation.isPending}
          onClick={() => roleMutation.mutate(pendingRole)}
        >
          {roleMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
        </Button>
      )}
    </div>
  );
}

function ManageStaffTab({
  restaurantSlug,
  sessionUserId,
  sessionRole,
}: {
  restaurantSlug: string;
  sessionUserId: number;
  sessionRole: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: staff = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: [`/api/${restaurantSlug}/staff`],
    refetchInterval: 30000,
  });

  const form = useForm<AddStaffForm>({
    resolver: zodResolver(addStaffSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", role: undefined as any },
  });

  const addMutation = useMutation({
    mutationFn: ({ confirmPassword: _cp, ...data }: AddStaffForm) =>
      apiRequest("POST", `/api/${restaurantSlug}/staff`, data).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Staff member added" });
      form.reset();
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: [`/api/${restaurantSlug}/staff`] });
    },
    onError: async (err: any) => {
      const body = err?.response ? await err.response.json().catch(() => ({})) : {};
      const msg = body.message ?? "Failed to add staff member";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) =>
      apiRequest("DELETE", `/api/${restaurantSlug}/staff/${userId}`),
    onSuccess: () => {
      toast({ title: "Staff member removed" });
      queryClient.invalidateQueries({ queryKey: [`/api/${restaurantSlug}/staff`] });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove staff member", variant: "destructive" }),
  });

  // Role options available to the current session user when adding
  const addableRoles: Array<"manager" | "employee" | "driver"> =
    sessionRole === "owner" ? ["manager", "employee", "driver"] : ["employee", "driver"];

  // Whether current user can remove a given member
  const canRemove = (member: StaffMember) =>
    member.role !== "owner" &&
    member.userId !== sessionUserId &&
    (sessionRole === "owner" || (sessionRole === "manager" && member.role !== "manager"));

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* ── Staff list ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-gray-500" />
          Staff ({staff.length})
        </h3>
        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setShowForm(v => !v)}>
          <Plus className="w-3.5 h-3.5" />
          {showForm ? "Cancel" : "Add"}
        </Button>
      </div>

      {/* Add form (collapsible) */}
      {showForm && (
        <div className="px-4 py-4 bg-gray-50 border-b border-gray-100 shrink-0">
          <h4 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <UserCircle className="w-3.5 h-3.5" />
            New Staff Member
          </h4>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(d => addMutation.mutate(d))} className="space-y-2.5">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Full Name</FormLabel>
                  <FormControl><Input placeholder="Jane Smith" className="h-8 text-sm" {...field} /></FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Email</FormLabel>
                  <FormControl><Input type="email" placeholder="jane@example.com" className="h-8 text-sm" {...field} /></FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Password</FormLabel>
                    <FormControl><Input type="password" placeholder="Min 8 chars" className="h-8 text-sm" {...field} /></FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />
                <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Confirm</FormLabel>
                    <FormControl><Input type="password" placeholder="Repeat" className="h-8 text-sm" {...field} /></FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select role" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {addableRoles.map(r => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-xs" />
                </FormItem>
              )} />
              <Button type="submit" className="w-full h-8 text-sm" disabled={addMutation.isPending}>
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Account"}
              </Button>
            </form>
          </Form>
        </div>
      )}

      {/* Staff list */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : staff.length === 0 ? (
        <div className="text-center py-10 text-gray-400 px-4">
          <Users className="w-7 h-7 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No staff yet</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {staff.map(member => (
            <li key={member.userId} className="px-4 py-3">
              {/* Name + remove */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {member.name ?? <span className="text-gray-400 italic">No name</span>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{member.email}</p>
                </div>
                {canRemove(member) && (
                  <button
                    onClick={() => removeMutation.mutate(member.userId)}
                    disabled={removeMutation.isPending}
                    className="shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1 rounded mt-0.5"
                    title="Remove from restaurant"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {/* Role editor + joined date */}
              <div className="flex items-center justify-between gap-2">
                <RoleEditor
                  member={member}
                  sessionRole={sessionRole}
                  sessionUserId={sessionUserId}
                  restaurantSlug={restaurantSlug}
                />
                <span className="text-xs text-gray-400 shrink-0">
                  Joined {formatMemberDate(member.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({
  restaurantSlug,
  currentName,
  onNameSaved,
}: {
  restaurantSlug: string;
  currentName: string;
  onNameSaved: (name: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nameValue, setNameValue] = useState(currentName);

  const saveMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest("PATCH", `/api/${restaurantSlug}/settings/name`, { name }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Name updated" });
      queryClient.invalidateQueries({ queryKey: [`/api/${restaurantSlug}/info`] });
      onNameSaved(data.name);
    },
    onError: () => toast({ title: "Error", description: "Failed to save name", variant: "destructive" }),
  });

  // Keep local state in sync when currentName changes (e.g. after another save)
  useState(() => { setNameValue(currentName); });

  return (
    <div className="px-4 py-4 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-gray-500" />
          Restaurant Details
        </h3>
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">Restaurant Name</label>
          <Input
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            className="h-9 text-sm"
            placeholder="Restaurant name"
          />
          <Button
            className="w-full h-8 text-sm"
            disabled={saveMutation.isPending || nameValue.trim() === currentName || !nameValue.trim()}
            onClick={() => saveMutation.mutate(nameValue.trim())}
          >
            {saveMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><Save className="w-3.5 h-3.5 mr-1.5" />Save Name</>
            }
          </Button>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-400 italic">More settings coming soon — opening hours, contact details, and delivery zones.</p>
      </div>
    </div>
  );
}

// ── Delivered History Tab ─────────────────────────────────────────────────────

function formatDeliveredAt(ts: string | Date) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${time} · ${date}`;
}

function DeliveredHistoryTab({ restaurantSlug }: { restaurantSlug: string }) {
  const { data: history = [], isLoading } = useQuery<DeliveredOrderWithDriver[]>({
    queryKey: [`/api/${restaurantSlug}/orders/delivered`],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 px-4">
        <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No delivered orders yet</p>
        <p className="text-xs mt-1">Completed deliveries will appear here</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
        <p className="text-xs text-gray-500">{history.length} order{history.length !== 1 ? "s" : ""} total</p>
      </div>
      <ul className="divide-y divide-gray-100">
        {[...history].reverse().map(order => (
          <li key={order.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
            {/* Top row: order number + timestamp */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <PlatformIcon platform={order.platform} />
                <span className="text-xs font-semibold text-gray-700">#{order.orderNumber}</span>
              </div>
              <span className="text-xs text-gray-400">{formatDeliveredAt(order.deliveredAt)}</span>
            </div>

            {/* Address */}
            <div className="flex items-start gap-1.5 mb-1">
              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
              <p className="text-xs text-gray-600 leading-snug line-clamp-2">{order.address}</p>
            </div>

            {/* Platform + driver */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{formatPlatform(order.platform)}</span>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <User className="w-3 h-3" />
                {order.driverEmail
                  ? <span className="max-w-[120px] truncate">{order.driverEmail}</span>
                  : <span className="italic">Unassigned</span>
                }
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Staff Sidebar ─────────────────────────────────────────────────────────────

type SidebarTab = "orders" | "delivered" | "staff" | "settings";

function StaffSidebar({
  session,
  restaurantName,
  orders,
  drivers,
  deliveredToday,
  restaurantSlug,
  selectedOrderId,
  onOrderSelect,
  onAddOrder,
  onRefetch,
  onLogout,
  onCloseMobile,
  onNameSaved,
}: {
  session: RestaurantSession;
  restaurantName: string;
  orders: Order[];
  drivers: ActiveDriver[];
  deliveredToday: number;
  restaurantSlug: string;
  selectedOrderId: number | null;
  onOrderSelect: (id: number | null) => void;
  onAddOrder: () => void;
  onRefetch: () => void;
  onLogout: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onNameSaved: (name: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("orders");

  const cooking = orders.filter(o => o.status === "cooking").length;
  const packed  = orders.filter(o => o.status === "packed").length;
  const transit = orders.filter(o => o.status === "in-transit").length;

  const roleLabel = session.role.charAt(0).toUpperCase() + session.role.slice(1);
  const canManageStaff    = session.role === "owner" || session.role === "manager";
  const canViewDelivered  = session.role === "owner" || session.role === "manager";
  const canManageSettings = session.role === "owner";

  // Tab definitions
  const tabs: { id: SidebarTab; label: string; icon: React.ReactNode }[] = [
    { id: "orders",    label: "Orders",    icon: <UtensilsCrossed className="w-3.5 h-3.5" /> },
    ...(canViewDelivered  ? [{ id: "delivered" as SidebarTab, label: "Delivered", icon: <History className="w-3.5 h-3.5" /> }] : []),
    ...(canManageStaff    ? [{ id: "staff"     as SidebarTab, label: "Staff",     icon: <Users className="w-3.5 h-3.5" /> }] : []),
    ...(canManageSettings ? [{ id: "settings"  as SidebarTab, label: "Settings",  icon: <Settings className="w-3.5 h-3.5" /> }] : []),
  ];

  return (
    <div className="w-full h-full bg-white shadow-lg flex flex-col border-r border-gray-200">
      {/* Header */}
      <div className="px-5 py-4 bg-primary text-white border-b border-blue-700">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight truncate">{restaurantName}</h1>
            <p className="text-blue-100 text-xs mt-0.5">{roleLabel}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={onLogout}
              className="text-white hover:bg-blue-700 hidden md:flex items-center gap-1 h-8 px-2 text-xs">
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </Button>
            <button className="md:hidden text-white hover:bg-blue-700 p-1.5 rounded" onClick={onCloseMobile}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar — only shown when there's more than one tab */}
      {tabs.length > 1 && (
        <div className="flex border-b border-gray-200 bg-gray-50 shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? "border-primary text-primary bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {activeTab === "orders" && (
        <>
          {/* Add Order */}
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
            <Button onClick={onAddOrder} className="w-full bg-primary hover:bg-blue-700 text-white text-sm h-9">
              <Plus className="w-4 h-4 mr-1.5" />
              Add New Order
            </Button>
          </div>

          {/* Order Summary */}
          <div className="px-4 py-3 border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-2 mb-2.5">
              <BarChart3 className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-800">Order Summary</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { dotClass: "bg-red-500",    label: "Cooking",    count: cooking },
                { dotClass: "bg-blue-500",   label: "Packed",     count: packed },
                { dotClass: "bg-orange-500", label: "In Transit", count: transit },
                { dotClass: "bg-green-500",  label: "Delivered",  count: deliveredToday },
              ].map(({ dotClass, label, count }) => (
                <div key={label} className="flex items-center justify-between bg-gray-50 rounded-md px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${dotClass}`} />
                    <span className="text-xs text-gray-600">{label}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Active Orders */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">Active Orders</h2>
            {orders.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No active orders</p>
                <p className="text-xs mt-1">Add an order to get started</p>
              </div>
            ) : (
              orders.map(order => (
                <StaffOrderCard
                  key={order.id}
                  order={order}
                  drivers={drivers}
                  restaurantSlug={restaurantSlug}
                  isSelected={selectedOrderId === order.id}
                  onSelect={() => onOrderSelect(order.id)}
                  onRefetch={onRefetch}
                />
              ))
            )}
          </div>

          {/* Scan Receipt */}
          <div className="px-4 py-3 border-t border-gray-200 shrink-0">
            <ReceiptScanner
              onOrderCreated={onRefetch}
              apiPath={`/api/${restaurantSlug}/orders`}
            />
          </div>
        </>
      )}

      {activeTab === "delivered" && canViewDelivered && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <DeliveredHistoryTab restaurantSlug={restaurantSlug} />
        </div>
      )}

      {activeTab === "staff" && canManageStaff && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ManageStaffTab restaurantSlug={restaurantSlug} sessionUserId={session.userId} sessionRole={session.role} />
        </div>
      )}

      {activeTab === "settings" && canManageSettings && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <SettingsTab
            restaurantSlug={restaurantSlug}
            currentName={restaurantName}
            onNameSaved={onNameSaved}
          />
        </div>
      )}
    </div>
  );
}

// ── Driver Order Card ─────────────────────────────────────────────────────────

function DriverOrderCard({
  order,
  restaurantSlug,
  onRefetch,
}: {
  order: Order;
  restaurantSlug: string;
  onRefetch: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG["cooking"];

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.address)}`;

  const deliveredMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/${restaurantSlug}/orders/${order.id}/delivery-status`, {}),
    onSuccess: () => {
      toast({ title: "Order delivered!", description: "Order marked as delivered." });
      queryClient.invalidateQueries({ queryKey: [`/api/${restaurantSlug}/driver/orders`] });
      onRefetch();
    },
    onError: () => toast({ title: "Error", description: "Failed to mark as delivered.", variant: "destructive" }),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${cfg.dotClass} shrink-0 mt-0.5`} />
          <span className="text-sm font-semibold text-gray-800">#{order.orderNumber}</span>
        </div>
        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${cfg.bgClass} border-0`}>
          {cfg.label}
        </Badge>
      </div>

      <div className="flex items-start gap-2 mb-1">
        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-sm text-gray-700 leading-snug">{order.address}</p>
      </div>
      <div className="flex items-center gap-1.5 mb-3">
        <PlatformIcon platform={order.platform} />
        <span className="text-xs text-gray-500">{formatPlatform(order.platform)}</span>
      </div>

      <div className="flex gap-2">
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
          <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5">
            <Navigation className="w-3.5 h-3.5" />
            Open Maps
          </Button>
        </a>
        {order.status !== "delivered" && (
          <Button
            size="sm"
            className="flex-1 h-8 text-xs bg-green-500 hover:bg-green-600 text-white border-0"
            onClick={() => deliveredMutation.mutate()}
            disabled={deliveredMutation.isPending}
          >
            {deliveredMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Mark Delivered</>
            }
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Driver View ───────────────────────────────────────────────────────────────

function DriverView({
  session,
  restaurantName,
  restaurantSlug,
  onLogout,
}: {
  session: RestaurantSession;
  restaurantName: string;
  restaurantSlug: string;
  onLogout: () => void;
}) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectionKey, setSelectionKey] = useState(0);

  const { data: orders = [], refetch, isLoading } = useQuery<Order[]>({
    queryKey: [`/api/${restaurantSlug}/driver/orders`],
    refetchInterval: 30000,
  });

  const handleOrderSelect = (id: number | null) => {
    setSelectedOrderId(id);
    setSelectionKey(k => k + 1);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-primary text-white shadow-md shrink-0">
        <div>
          <h1 className="font-semibold text-base leading-tight">{restaurantName}</h1>
          <p className="text-blue-100 text-xs">Driver — {session.userId}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onLogout}
          className="text-white hover:bg-blue-700 h-8 px-2 text-xs gap-1.5">
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </Button>
      </div>

      {/* Body: order list + map */}
      <div className="flex flex-1 min-h-0">
        {/* Orders panel */}
        <div className="w-80 shrink-0 flex flex-col bg-white border-r border-gray-200 overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-800">My Deliveries</h2>
            <p className="text-xs text-gray-500 mt-0.5">{orders.length} order{orders.length !== 1 ? "s" : ""} assigned</p>
          </div>
          <div className="p-3 space-y-3 flex-1">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No orders assigned</p>
                <p className="text-xs mt-1">Your orders will appear here</p>
              </div>
            ) : (
              orders.map(order => (
                <DriverOrderCard
                  key={order.id}
                  order={order}
                  restaurantSlug={restaurantSlug}
                  onRefetch={refetch}
                />
              ))
            )}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer
            orders={orders}
            selectedOrderId={selectedOrderId}
            selectionKey={selectionKey}
            onOrderSelect={handleOrderSelect}
          />
        </div>
      </div>
    </div>
  );
}

// ── Staff View ────────────────────────────────────────────────────────────────

function StaffView({
  session,
  restaurantName: initialRestaurantName,
  restaurantSlug,
  onLogout,
}: {
  session: RestaurantSession;
  restaurantName: string;
  restaurantSlug: string;
  onLogout: () => void;
}) {
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectionKey, setSelectionKey] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [restaurantName, setRestaurantName] = useState(initialRestaurantName);

  // Keep local name in sync if parent updates (e.g. on first fetch)
  useEffect(() => { setRestaurantName(initialRestaurantName); }, [initialRestaurantName]);

  const handleOrderSelect = (id: number | null) => {
    setSelectedOrderId(id);
    setSelectionKey(k => k + 1);
  };

  const { data: orders = [], refetch, isLoading } = useQuery<Order[]>({
    queryKey: [`/api/${restaurantSlug}/orders`],
    refetchInterval: 30000,
  });

  const { data: deliveredList = [] } = useQuery<any[]>({
    queryKey: [`/api/${restaurantSlug}/orders/delivered/today`],
    refetchInterval: 60000,
  });

  const { data: drivers = [] } = useQuery<ActiveDriver[]>({
    queryKey: [`/api/${restaurantSlug}/active-drivers`],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:relative z-50 md:z-0
        w-80 h-full transform transition-transform duration-300
        ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <StaffSidebar
          session={session}
          restaurantName={restaurantName}
          orders={orders}
          drivers={drivers}
          deliveredToday={deliveredList.length}
          restaurantSlug={restaurantSlug}
          selectedOrderId={selectedOrderId}
          onOrderSelect={handleOrderSelect}
          onAddOrder={() => setAddOrderOpen(true)}
          onRefetch={refetch}
          onLogout={onLogout}
          isMobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onNameSaved={name => setRestaurantName(name)}
        />
      </div>

      {/* Map area */}
      <div className="flex-1 relative">
        {/* Mobile menu toggle */}
        <button
          className="md:hidden fixed top-4 left-4 z-30 bg-primary text-white p-2 rounded-lg shadow-lg"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <MapContainer
          orders={orders}
          selectedOrderId={selectedOrderId}
          selectionKey={selectionKey}
          onOrderSelect={handleOrderSelect}
        />
      </div>

      {/* Map legend (status colours) already inside MapContainer */}

      <AddOrderModal
        open={addOrderOpen}
        onClose={() => setAddOrderOpen(false)}
        restaurantSlug={restaurantSlug}
        onSuccess={() => { refetch(); setAddOrderOpen(false); }}
      />
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function RestaurantDashboard() {
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: session, isLoading: sessionLoading, error: sessionError } = useQuery<RestaurantSession>({
    queryKey: [`/api/${restaurantSlug}/me`],
    queryFn: async () => {
      const res = await fetch(`/api/${restaurantSlug}/me`, { credentials: "include" });
      if (res.status === 401) throw Object.assign(new Error("Unauthorized"), { status: 401 });
      if (!res.ok) throw new Error("Server error");
      return res.json();
    },
    retry: false,
  });

  const { data: restaurantInfo } = useQuery<{ name: string; slug: string }>({
    queryKey: [`/api/${restaurantSlug}/info`],
    enabled: !!session,
  });

  // Redirect to login on 401
  useEffect(() => {
    if (sessionError && (sessionError as any).status === 401) {
      navigate(`/${restaurantSlug}/login`);
    }
  }, [sessionError, restaurantSlug, navigate]);

  const handleLogout = async () => {
    try {
      await apiRequest("POST", `/api/${restaurantSlug}/logout`, {});
      queryClient.clear();
      navigate(`/${restaurantSlug}/login`);
    } catch {
      toast({ title: "Error", description: "Logout failed.", variant: "destructive" });
    }
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const restaurantName = restaurantInfo?.name ?? restaurantSlug ?? "Restaurant";

  if (session.role === "driver") {
    return (
      <DriverView
        session={session}
        restaurantName={restaurantName}
        restaurantSlug={restaurantSlug!}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <StaffView
      session={session}
      restaurantName={restaurantName}
      restaurantSlug={restaurantSlug!}
      onLogout={handleLogout}
    />
  );
}
