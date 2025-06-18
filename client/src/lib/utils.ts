import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatOrderTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("en-UK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatPlatformName(platform: string): string {
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
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "pending":
      return "bg-red-500";
    case "in-transit":
      return "bg-orange-500";
    case "delivered":
      return "bg-green-500";
    default:
      return "bg-gray-500";
  }
}

export function getStatusDisplayName(status: string): string {
  return status.replace("-", " ").toUpperCase();
}
