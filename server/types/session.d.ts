import "express-session";

declare module "express-session" {
  interface SessionData {
    restaurantSession?: {
      userId: number;
      role: string;
      restaurantId: number;
      restaurantSlug: string;
    };
  }
}
