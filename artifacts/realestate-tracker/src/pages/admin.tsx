import { useState, useEffect } from "react";
import { useUser } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, Users, Building2, Mail, Crown, UserX, Loader2,
  RefreshCw, Activity, Search, Send, FileCheck, DollarSign, TrendingUp, Landmark, MapPin,
} from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

// Fix default Leaflet marker icons broken by Vite asset pipeline
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

// ── Types ──────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl: string;
  createdAt: string;
  lastSignInAt: string | null;
  role: string;
}

interface AdminStats {
  totalUsers: number;
  totalProperties: number;
  activeThisMonth: number;
  adminCount: number;
  digestEnabledCount: number;
  platformPortfolioValue: number;
  platformEquity: number;
  platformOriginalLoan: number;
  platformLoanBalance: number;
  recentUsers: AdminUser[];
}

interface TermsAcceptance {
  id: number;
  userId: string;
  email: string;
  phone: string;
  ipAddress: string | null;
  userAgent: string | null;
  acceptedAt: string;
}

interface GeoProperty {
  id: number;
  name: string;
  address: string;
  currentValue: number;
  equity: number;
  loanBalance: number;
  lat: number | null;
  lng: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

interface StateGroup {
  state: string;
  count: number;
  totalValue: number;
  totalEquity: number;
  totalDebt: number;
}

interface PropertiesGeoResponse {
  properties: GeoProperty[];
  byState: StateGroup[];
}

// ── API helpers ────────────────────────────────────────────────────────────

async function fetchAdminStats(): Promise<AdminStats> {
  const res = await fetch("/api/admin/stats");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchTermsAcceptances(): Promise<TermsAcceptance[]> {
  const res = await fetch("/api/admin/terms-acceptances");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchPropertiesGeo(): Promise<PropertiesGeoResponse> {
  const res = await fetch("/api/admin/properties-geo");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function becomeAdmin(): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/admin/become", { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Failed");
  return body;
}

async function findUserByEmail(email: string): Promise<AdminUser> {
  const res = await fetch(`/api/admin/users/find?email=${encodeURIComponent(email)}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Not found");
  return body;
}

async function setAdminRole(userId: string, action: "make" | "remove"): Promise<void> {
  const path = action === "make" ? "make-admin" : "remove-admin";
  const res = await fetch(`/api/admin/users/${userId}/${path}`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed");
  }
}

async function broadcastEmail(subject: string, message: string): Promise<{ sent: number; failed: number; total: number }> {
  const res = await fetch("/api/admin/broadcast-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, message }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Failed to send");
  return body;
}

// ── Properties Map tab ─────────────────────────────────────────────────────

function PropertiesMapTab({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<PropertiesGeoResponse>({
    queryKey: ["admin-properties-geo"],
    queryFn: fetchPropertiesGeo,
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000, // 5 min — geocoding is slow, don't re-fetch constantly
  });

  const mapped = data?.properties.filter(p => p.lat !== null && p.lng !== null) ?? [];
  const unmapped = data?.properties.filter(p => p.lat === null || p.lng === null) ?? [];

  // Compute map center from average of all geocoded properties
  const center: [number, number] = mapped.length > 0
    ? [
        mapped.reduce((s, p) => s + p.lat!, 0) / mapped.length,
        mapped.reduce((s, p) => s + p.lng!, 0) / mapped.length,
      ]
    : [39.5, -98.35]; // geographic center of USA as fallback

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data
            ? `${mapped.length} of ${data.properties.length} properties plotted`
            : "Loading property locations…"}
        </p>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Map */}
      <Card className="overflow-hidden">
        <div className="h-[480px] w-full relative">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/60 z-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Geocoding addresses — this may take a moment on first load…</p>
            </div>
          )}
          {isError && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/60 z-10">
              <p className="text-sm text-destructive">Failed to load map data.</p>
            </div>
          )}
          {!isLoading && (
            <MapContainer
              center={center}
              zoom={mapped.length === 1 ? 12 : 4}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {mapped.map(p => (
                <Marker key={p.id} position={[p.lat!, p.lng!]}>
                  <Popup>
                    <div className="space-y-1 min-w-[180px]">
                      <p className="font-semibold text-sm">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.address}</p>
                      <div className="pt-1 space-y-0.5 text-xs">
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-500">Value</span>
                          <span className="font-medium">{formatCurrency(p.currentValue)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-500">Equity</span>
                          <span className="font-medium text-emerald-700">{formatCurrency(p.equity)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-500">Debt</span>
                          <span className="font-medium">{formatCurrency(p.loanBalance)}</span>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>
      </Card>

      {/* By-state breakdown */}
      {data && data.byState.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              By State / Region
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>State / Region</TableHead>
                  <TableHead className="text-center">Properties</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead className="text-right">Total Equity</TableHead>
                  <TableHead className="text-right">Total Debt</TableHead>
                  <TableHead className="text-right">Equity %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byState.map(s => (
                  <TableRow key={s.state}>
                    <TableCell className="font-medium">{s.state}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{s.count}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(s.totalValue)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                      {formatCurrency(s.totalEquity)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {formatCurrency(s.totalDebt)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatPercent(s.totalValue > 0 ? (s.totalEquity / s.totalValue) * 100 : 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {data.byState.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/20">
                    <td className="px-4 py-2.5 font-semibold">Total</td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground font-semibold">
                      {data.properties.length}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-sm">
                      {formatCurrency(data.byState.reduce((s, r) => s + r.totalValue, 0))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-sm text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(data.byState.reduce((s, r) => s + r.totalEquity, 0))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-sm text-muted-foreground">
                      {formatCurrency(data.byState.reduce((s, r) => s + r.totalDebt, 0))}
                    </td>
                    <td className="px-4 py-2.5" />
                  </tr>
                </tfoot>
              )}
            </Table>
          </CardContent>
        </Card>
      )}

      {/* All properties list */}
      {data && data.properties.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              All Properties
              {unmapped.length > 0 && (
                <span className="ml-auto text-xs font-normal text-amber-600">
                  {unmapped.length} address{unmapped.length !== 1 ? "es" : ""} could not be geocoded
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Equity</TableHead>
                  <TableHead className="text-center w-16">Map</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.properties.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.address}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.city ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.state ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(p.currentValue)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(p.equity)}
                    </TableCell>
                    <TableCell className="text-center">
                      {p.lat !== null
                        ? <MapPin className="w-4 h-4 text-primary mx-auto" />
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data && data.properties.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No properties have been added yet.</p>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { user, isLoaded } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = isLoaded && user?.publicMetadata?.role === "admin";

  const { data, isLoading, isError, refetch, isFetching } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: fetchAdminStats,
    enabled: isAdmin,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: acceptances, isLoading: acceptancesLoading } = useQuery<TermsAcceptance[]>({
    queryKey: ["admin-terms-acceptances"],
    queryFn: fetchTermsAcceptances,
    enabled: isAdmin,
    staleTime: 0,
  });

  // Bootstrap
  const becomeMutation = useMutation({
    mutationFn: becomeAdmin,
    onSuccess: async (result) => {
      toast({ title: "Admin access granted", description: result.message });
      await user?.reload();
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-exists"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Promote / demote
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const promoteMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "make" | "remove" }) => setAdminRole(id, action),
    onMutate: ({ id }) => setPromotingId(id),
    onSettled: () => setPromotingId(null),
    onSuccess: () => {
      toast({ title: "Role updated" });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Add admin by email
  const [searchEmail, setSearchEmail] = useState("");
  const [foundUser, setFoundUser] = useState<AdminUser | null>(null);
  const [searching, setSearching] = useState(false);

  const handleFindUser = async () => {
    if (!searchEmail.trim()) return;
    setSearching(true);
    setFoundUser(null);
    try {
      const u = await findUserByEmail(searchEmail.trim());
      setFoundUser(u);
    } catch (err: unknown) {
      toast({ title: "Not found", description: err instanceof Error ? err.message : "No user found", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const addAdminMutation = useMutation({
    mutationFn: (id: string) => setAdminRole(id, "make"),
    onSuccess: () => {
      toast({ title: "Admin added", description: `${foundUser?.email} is now an admin.` });
      setFoundUser(null);
      setSearchEmail("");
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Broadcast email
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");

  const broadcastMutation = useMutation({
    mutationFn: () => broadcastEmail(emailSubject, emailMessage),
    onSuccess: ({ sent, failed, total }) => {
      toast({
        title: "Broadcast sent",
        description: `Delivered to ${sent} of ${total} users${failed > 0 ? ` (${failed} failed)` : ""}.`,
      });
      setEmailSubject("");
      setEmailMessage("");
    },
    onError: (err: Error) => toast({ title: "Send failed", description: err.message, variant: "destructive" }),
  });

  // ── Not yet admin ────────────────────────────────────────────────────────

  if (!isLoaded) {
    return <div className="flex justify-center p-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <ShieldCheck className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Admin Access</h1>
          <p className="text-muted-foreground mt-1 max-w-sm">
            You don't have admin access yet. If you're the app owner, click below to claim it.
          </p>
        </div>
        <Button onClick={() => becomeMutation.mutate()} disabled={becomeMutation.isPending} className="gap-2">
          {becomeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
          Claim Admin Access
        </Button>
        <p className="text-xs text-muted-foreground">This only works if no admin exists yet.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-center text-destructive">
        <h2 className="text-xl font-bold">Failed to load admin stats</h2>
        <Button variant="outline" className="mt-4" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Platform overview and user management.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-2">
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="w-4 h-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-2">
            <MapPin className="w-4 h-4" /> Properties Map
          </TabsTrigger>
        </TabsList>

        {/* ── Overview tab ───────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-8 mt-4">

          {/* Platform user stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Users"
              value={data.totalUsers.toString()}
              icon={<Users className="w-5 h-5 text-muted-foreground" />}
              subtext={`${data.adminCount} admin${data.adminCount !== 1 ? "s" : ""}`}
            />
            <StatCard
              title="Active This Month"
              value={(data.activeThisMonth ?? 0).toString()}
              icon={<Activity className="w-5 h-5 text-muted-foreground" />}
              subtext="signed in within 30 days"
            />
            <StatCard
              title="Total Properties"
              value={data.totalProperties.toString()}
              icon={<Building2 className="w-5 h-5 text-muted-foreground" />}
              subtext="across all users"
            />
            <StatCard
              title="Digest Subscribers"
              value={data.digestEnabledCount.toString()}
              icon={<Mail className="w-5 h-5 text-muted-foreground" />}
              subtext="monthly email on"
            />
          </div>

          {/* Platform financial totals */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Platform — Real Estate Tracked</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Property Value"
                value={formatCurrency(data.platformPortfolioValue)}
                icon={<Building2 className="w-5 h-5 text-muted-foreground" />}
                subtext="current value across all users"
              />
              <StatCard
                title="Total Equity Tracked"
                value={formatCurrency(data.platformEquity)}
                icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
                subtext={`${formatPercent(data.platformPortfolioValue > 0 ? (data.platformEquity / data.platformPortfolioValue) * 100 : 0)} of total value`}
              />
              <StatCard
                title="Total Debt Tracked"
                value={formatCurrency(data.platformLoanBalance)}
                icon={<Landmark className="w-5 h-5 text-destructive" />}
                subtext="estimated remaining balances"
              />
              <StatCard
                title="Originally Financed"
                value={formatCurrency(data.platformOriginalLoan)}
                icon={<DollarSign className="w-5 h-5 text-muted-foreground" />}
                subtext="sum of all original loan amounts"
              />
            </div>
          </div>

          {/* Add admin + Broadcast email */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Crown className="w-4 h-4" />
                  Add Admin by Email
                </CardTitle>
                <CardDescription>Look up a user by their email address and grant them admin access.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="user@example.com"
                    type="email"
                    value={searchEmail}
                    onChange={e => { setSearchEmail(e.target.value); setFoundUser(null); }}
                    onKeyDown={e => e.key === "Enter" && handleFindUser()}
                  />
                  <Button variant="outline" onClick={handleFindUser} disabled={searching || !searchEmail.trim()} className="shrink-0 gap-1">
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Find
                  </Button>
                </div>
                {foundUser && (
                  <div className="flex items-center justify-between rounded-lg border p-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarImage src={foundUser.imageUrl} />
                        <AvatarFallback className="text-xs">
                          {`${foundUser.firstName[0] ?? ""}${foundUser.lastName[0] ?? ""}`.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{foundUser.firstName} {foundUser.lastName}</p>
                        <p className="text-xs text-muted-foreground truncate">{foundUser.email}</p>
                      </div>
                      <Badge variant={foundUser.role === "admin" ? "default" : "secondary"} className="shrink-0">
                        {foundUser.role === "admin" ? "Admin" : "User"}
                      </Badge>
                    </div>
                    {foundUser.role !== "admin" ? (
                      <Button
                        size="sm"
                        className="shrink-0 gap-1"
                        disabled={addAdminMutation.isPending}
                        onClick={() => addAdminMutation.mutate(foundUser.id)}
                      >
                        {addAdminMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crown className="w-3 h-3" />}
                        Make Admin
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">Already admin</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Send className="w-4 h-4" />
                  Broadcast Email
                </CardTitle>
                <CardDescription>Send a message to all {data.totalUsers} registered users.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="email-subject">Subject</Label>
                  <Input
                    id="email-subject"
                    placeholder="Important update about RealTrack"
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-message">Message</Label>
                  <Textarea
                    id="email-message"
                    placeholder="Write your message here…"
                    rows={4}
                    value={emailMessage}
                    onChange={e => setEmailMessage(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full gap-2"
                  disabled={broadcastMutation.isPending || !emailSubject.trim() || !emailMessage.trim()}
                  onClick={() => broadcastMutation.mutate()}
                >
                  {broadcastMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                    : <><Send className="w-4 h-4" /> Send to All Users</>}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* T&C Acceptances */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <FileCheck className="w-4 h-4" />
                T&amp;C Acceptances
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {acceptances ? `${acceptances.length} record${acceptances.length !== 1 ? "s" : ""}` : ""}
                </span>
              </CardTitle>
              <CardDescription>
                Every user who accepted the Terms of Service &amp; Liability Disclaimer, with timestamp and IP for your records.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {acceptancesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : !acceptances || acceptances.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">No acceptances recorded yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Accepted</TableHead>
                        <TableHead>IP Address</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {acceptances.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-sm font-medium">{a.email}</TableCell>
                          <TableCell className="text-sm text-muted-foreground font-mono">{a.phone}</TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(a.acceptedAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground font-mono">
                            {a.ipAddress ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Users table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Users className="w-4 h-4" />
                All Users
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {data.recentUsers.length} shown
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.recentUsers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No users yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Last sign-in</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentUsers.map((u) => {
                      const initials = `${u.firstName[0] ?? ""}${u.lastName[0] ?? ""}`.toUpperCase() || "?";
                      const isCurrentUser = u.id === user?.id;
                      const isPending = promotingId === u.id;
                      return (
                        <TableRow key={u.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={u.imageUrl} />
                                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm">
                                {u.firstName} {u.lastName}
                                {isCurrentUser && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                              {u.role === "admin" ? "Admin" : "User"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {!isCurrentUser && (
                              u.role === "admin" ? (
                                <Button
                                  size="sm" variant="ghost"
                                  className="gap-1 text-destructive hover:text-destructive"
                                  disabled={isPending}
                                  onClick={() => promoteMutation.mutate({ id: u.id, action: "remove" })}
                                >
                                  {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
                                  Remove admin
                                </Button>
                              ) : (
                                <Button
                                  size="sm" variant="ghost" className="gap-1"
                                  disabled={isPending}
                                  onClick={() => promoteMutation.mutate({ id: u.id, action: "make" })}
                                >
                                  {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crown className="w-3 h-3" />}
                                  Make admin
                                </Button>
                              )
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Properties Map tab ─────────────────────────────────────────── */}
        <TabsContent value="map" className="mt-4">
          <PropertiesMapTab isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
