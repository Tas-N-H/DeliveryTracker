import { apiRequest } from "./queryClient";

export interface GeocodeResult {
  latitude: string;
  longitude: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const response = await apiRequest("POST", "/api/geocode", { address });
  return response.json();
}

export function isValidUKPostcode(postcode: string): boolean {
  // UK postcode regex pattern
  const ukPostcodeRegex = /^[A-Z]{1,2}[0-9R][0-9A-Z]? [0-9][ABD-HJLNP-UW-Z]{2}$/i;
  return ukPostcodeRegex.test(postcode.trim());
}

export function extractPostcodeFromAddress(address: string): string | null {
  // Look for UK postcode pattern in the address
  const postcodeMatch = address.match(/([A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][ABD-HJLNP-UW-Z]{2})/i);
  return postcodeMatch ? postcodeMatch[1] : null;
}
