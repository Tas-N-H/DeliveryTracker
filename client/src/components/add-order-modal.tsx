import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertOrderSchema } from "@shared/schema";

const formSchema = insertOrderSchema.extend({
  address: z.string().min(10, "Please enter a complete address with postcode"),
});

type FormData = z.infer<typeof formSchema>;

interface AddOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddOrderModal({ isOpen, onClose, onSuccess }: AddOrderModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGeocoding, setIsGeocoding] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      orderNumber: "",
      address: "",
      platform: "",
      status: "pending",
      latitude: "",
      longitude: "",
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // First, geocode the address
      setIsGeocoding(true);
      try {
        const geocodeResponse = await apiRequest("POST", "/api/geocode", { address: data.address });
        const coordinates = await geocodeResponse.json();
        
        // Create order with coordinates
        const orderData = {
          ...data,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        };

        const response = await apiRequest("POST", "/api/orders", orderData);
        return response.json();
      } finally {
        setIsGeocoding(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order Added",
        description: "New order has been added to the map successfully.",
      });
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add order. Please check the address and try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createOrderMutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Order</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="orderNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order Number</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., UE2024013"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delivery Address</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Enter full address with postcode (e.g., 123 High Street, Chatham, ME4 4EZ)"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="platform"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Platform</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="uber-eats">Uber Eats</SelectItem>
                      <SelectItem value="just-eat">Just Eat</SelectItem>
                      <SelectItem value="website">Website</SelectItem>
                      <SelectItem value="phone">Phone Order</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex space-x-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="flex-1"
                disabled={createOrderMutation.isPending || isGeocoding}
              >
                {isGeocoding ? "Locating..." : createOrderMutation.isPending ? "Adding..." : "Add Order"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
