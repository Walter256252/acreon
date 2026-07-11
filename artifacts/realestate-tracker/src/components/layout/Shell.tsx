import React from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, PlusCircle, Calculator, Building2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Portfolio", icon: LayoutDashboard },
  { href: "/projections", label: "Projections", icon: TrendingUp },
  { href: "/properties/new", label: "Add Property", icon: PlusCircle },
  { href: "/calculator", label: "Calculator", icon: Calculator },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row bg-background">
      {/* Sidebar */}
      <aside className="w-full md:w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="p-6">
          <Link href="/" className="flex items-center gap-3 text-sidebar-foreground font-bold text-xl tracking-tight cursor-pointer">
            <Building2 className="w-6 h-6 text-sidebar-primary" />
            <span>RealTrack</span>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 mt-auto">
          <div className="bg-sidebar-accent/30 rounded-lg p-4 border border-sidebar-border">
            <h4 className="text-xs font-semibold text-sidebar-foreground/80 uppercase tracking-wider mb-1">Status</h4>
            <p className="text-xs text-sidebar-foreground/60">Live market data connection active. All systems operational.</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
