import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | undefined | null) {
  if (value === undefined || value === null) return "$0.00"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value)
}

export function formatPercent(value: number | undefined | null) {
  if (value === undefined || value === null) return "0.00%"
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100)
}

export function formatDate(dateString: string | undefined | null) {
  if (!dateString) return ""
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateString) ? `${dateString}T12:00:00` : dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
