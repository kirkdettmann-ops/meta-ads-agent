import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn — class-name helper.
 * Combines clsx (conditional classes) with tailwind-merge (resolves conflicts).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as currency. Default 2 decimals.
 * Pass `currency` from the tenant's Meta account (e.g. "USD", "EUR").
 */
export function formatCurrency(value: number | null | undefined, currency = "USD", decimals = 2): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${value.toFixed(decimals)} ${currency}`;
  }
}

/**
 * Format a number with thousands separators.
 */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a percent (0.085 -> "8.5%").
 */
export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format a date as a short string.
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Get a date N days ago in YYYY-MM-DD format.
 */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
