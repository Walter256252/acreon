import React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  subtext?: string;
  icon?: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  className?: string;
}

export function StatCard({ title, value, subtext, icon, trend, trendValue, className }: StatCardProps) {
  return (
    <Card className={cn("p-6 flex flex-col gap-2 relative overflow-hidden", className)}>
      <div className="flex justify-between items-start">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
        {icon && <div className="text-muted-foreground/50">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-3xl font-bold font-mono tracking-tight text-foreground">{value}</span>
      </div>
      {(subtext || trendValue) && (
        <div className="flex items-center gap-2 text-sm mt-auto pt-2">
          {trendValue && (
            <span
              className={cn(
                "font-medium",
                trend === "up" && "text-emerald-600 dark:text-emerald-500",
                trend === "down" && "text-destructive",
                trend === "neutral" && "text-muted-foreground"
              )}
            >
              {trend === "up" ? "↑ " : trend === "down" ? "↓ " : ""}
              {trendValue}
            </span>
          )}
          {subtext && <span className="text-muted-foreground">{subtext}</span>}
        </div>
      )}
    </Card>
  );
}
