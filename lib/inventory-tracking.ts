export type TrackingMode = "packages" | "items" | "weight";
type Stock = { quantity: number; packageSize: number; packageUnit: string; trackingMode?: TrackingMode; lowUnit?: string };
export function trackingMode(item: Stock): TrackingMode {
  return item.trackingMode ?? (item.lowUnit === "count" && ["count", "each"].includes(item.packageUnit) ? "items" : ["lb", "oz"].includes(item.packageUnit) ? "weight" : "packages");
}
export function trackingFactor(item: Stock, mode = trackingMode(item)) {
  if (mode === "items") return item.packageSize;
  if (mode === "weight") return item.packageUnit === "oz" ? item.packageSize / 16 : item.packageSize;
  return 1;
}
export function onHand(item: Stock) { return Math.round(item.quantity * trackingFactor(item) * 10000) / 10000; }
export function trackingLabel(item: Stock) { return trackingMode(item) === "weight" ? "lb" : trackingMode(item) === "items" ? "items" : "packages"; }
