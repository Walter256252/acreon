import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, PlusCircle, Calculator, Building2, TrendingUp, Mail, Settings, ShieldCheck, Scale, Map, CalendarDays, Wallet, FileText, LogOut, UserCog } from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/app", label: "Portfolio", icon: LayoutDashboard },
  { href: "/app/projections", label: "Projections", icon: TrendingUp },
  { href: "/app/properties", label: "Properties", icon: Building2 },
  { href: "/app/map", label: "Map View", icon: Map },
  { href: "/app/comparison", label: "Smart Comparison", icon: Scale },
  { href: "/app/communications", label: "Communications", icon: Mail },
  { href: "/app/occupancy", label: "Occupancy", icon: CalendarDays },
  { href: "/app/property-info", label: "Property Info", icon: FileText },
  { href: "/app/finances", label: "Finances", icon: Wallet },
  { href: "/app/properties/new", label: "Add Property", icon: PlusCircle },
  { href: "/app/calculator", label: "Calculator", icon: Calculator },
];

const BOTTOM_NAV_ITEMS = [
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function UserMenu() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const initials = user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "?";
  const label = user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress ?? "Account";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 px-3 py-2.5 w-full rounded-md hover:bg-sidebar-accent/50 transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
          {initials}
        </div>
        <span className="text-sm text-sidebar-foreground/70 truncate">{label}</span>
      </button>

      {open && (
        <div className="fixed z-[9999] w-52 rounded-lg border border-border bg-popover shadow-lg py-1"
          style={{
            bottom: (() => {
              if (!ref.current) return 60;
              const rect = ref.current.getBoundingClientRect();
              return window.innerHeight - rect.top + 4;
            })(),
            left: (() => {
              if (!ref.current) return 16;
              return ref.current.getBoundingClientRect().left;
            })(),
          }}
        >
          <div className="px-3 py-2 border-b border-border mb-1">
            <p className="text-xs font-medium text-foreground truncate">{label}</p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.emailAddresses?.[0]?.emailAddress}
            </p>
          </div>
          <button
            onClick={() => { setOpen(false); openUserProfile(); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <UserCog className="w-4 h-4 text-muted-foreground" />
            Manage account
          </button>
          <button
            onClick={() => { setOpen(false); signOut({ redirectUrl: "/" }); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

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
            <img src="/logo-symbol.svg" alt="Acreon" className="w-7 h-7 flex-shrink-0" />
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
          <UserMenu />
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
