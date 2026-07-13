import React from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, PlusCircle, Calculator, Building2, TrendingUp, Mail, Settings, ShieldCheck, Scale, Map, CalendarDays } from "lucide-react";
import { useUser, UserButton } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/app", label: "Portfolio", icon: LayoutDashboard },
  { href: "/app/projections", label: "Projections", icon: TrendingUp },
  { href: "/app/map", label: "Map View", icon: Map },
  { href: "/app/properties", label: "Properties", icon: Building2 },
  { href: "/app/comparison", label: "Smart Comparison", icon: Scale },
  { href: "/app/communications", label: "Communications", icon: Mail },
  { href: "/app/occupancy", label: "Occupancy", icon: CalendarDays },
  { href: "/app/properties/new", label: "Add Property", icon: PlusCircle },
  { href: "/app/calculator", label: "Calculator", icon: Calculator },
];

const BOTTOM_NAV_ITEMS = [
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";

  // Show the Admin link if the user is already an admin, OR if no admin exists
  // yet (bootstrap mode — page handles its own auth once clicked).
  const { data: existsData } = useQuery<{ adminExists: boolean }>({
    queryKey: ["admin-exists"],
    queryFn: () => fetch("/api/admin/exists").then((r) => r.json()),
    staleTime: 60_000,
  });
  const showAdminLink = isAdmin || existsData?.adminExists === false;

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row bg-background">
      {/* Sidebar */}
      <aside className="w-full md:w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="p-6">
          <Link href="/" className="flex items-center gap-3 text-sidebar-foreground font-bold text-xl tracking-tight cursor-pointer">
            <img src="/logo.png" alt="Acreon" className="w-7 h-7 object-contain" />
            <span>Acreon</span>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/app" && location.startsWith(item.href));
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
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 pb-2 mt-auto border-t border-sidebar-border pt-2 space-y-1">
          {showAdminLink && (() => {
            const isActive = location === "/app/admin" || location.startsWith("/app/admin");
            return (
              <Link
                href="/app/admin"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <ShieldCheck className="w-4 h-4" />
                Admin
              </Link>
            );
          })()}
          {BOTTOM_NAV_ITEMS.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href);
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
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
          <div className="flex items-center gap-3 px-3 py-2.5">
            <UserButton afterSignOutUrl="/" />
            <span className="text-sm text-sidebar-foreground/70 truncate">
              {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress ?? "Account"}
            </span>
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
