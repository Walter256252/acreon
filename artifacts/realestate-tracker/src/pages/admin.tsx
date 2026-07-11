import { useState } from "react";
import { useUser } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Users, Building2, CreditCard, Mail, Crown, UserX, Loader2 } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";

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
  totalPayments: number;
  adminCount: number;
  digestEnabledCount: number;
  recentUsers: AdminUser[];
}

// ── API helpers ────────────────────────────────────────────────────────────

async function fetchAdminStats(): Promise<AdminStats> {
  const res = await fetch("/api/admin/stats");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function becomeAdmin(): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/admin/become", { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Failed");
  return body;
}

async function makeAdmin(userId: string): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}/make-admin`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
}

async function removeAdmin(userId: string): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}/remove-admin`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { user, isLoaded } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const isAdmin = isLoaded && user?.publicMetadata?.role === "admin";

  // Stats query — only runs when admin
  const { data, isLoading, isError, refetch } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: fetchAdminStats,
    enabled: isAdmin,
    staleTime: 30_000,
  });

  // Bootstrap mutation — claim admin if no one has yet
  const becomeMutation = useMutation({
    mutationFn: becomeAdmin,
    onSuccess: async (result) => {
      toast({ title: "Admin access granted", description: result.message });
      await user?.reload();
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Promote / demote mutations
  const promoteMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "make" | "remove" }) =>
      action === "make" ? makeAdmin(id) : removeAdmin(id),
    onMutate: ({ id }) => setPromotingId(id),
    onSettled: () => setPromotingId(null),
    onSuccess: () => {
      toast({ title: "Role updated" });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── Not yet admin ──────────────────────────────────────────────────────

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
        <Button
          onClick={() => becomeMutation.mutate()}
          disabled={becomeMutation.isPending}
          className="gap-2"
        >
          {becomeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
          Claim Admin Access
        </Button>
        <p className="text-xs text-muted-foreground">This only works if no admin exists yet.</p>
      </div>
    );
  }

  // ── Loading / error ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1,2,3,4,5].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
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

  // ── Dashboard ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Platform overview and user management.</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Users"
          value={data.totalUsers.toString()}
          icon={<Users className="w-5 h-5 text-muted-foreground" />}
          subtext={`${data.adminCount} admin${data.adminCount !== 1 ? "s" : ""}`}
        />
        <StatCard
          title="Total Properties"
          value={data.totalProperties.toString()}
          icon={<Building2 className="w-5 h-5 text-muted-foreground" />}
          subtext="across all users"
        />
        <StatCard
          title="Payments Logged"
          value={data.totalPayments.toString()}
          icon={<CreditCard className="w-5 h-5 text-muted-foreground" />}
          subtext="total recorded"
        />
        <StatCard
          title="Digest Subscribers"
          value={data.digestEnabledCount.toString()}
          icon={<Mail className="w-5 h-5 text-muted-foreground" />}
          subtext="monthly email on"
        />
        <StatCard
          title="Admins"
          value={data.adminCount.toString()}
          icon={<ShieldCheck className="w-5 h-5 text-muted-foreground" />}
          subtext={`of ${data.totalUsers} users`}
        />
      </div>

      {/* Users table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Users className="w-4 h-4" />
            Recent Users
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
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-destructive hover:text-destructive"
                              disabled={isPending}
                              onClick={() => promoteMutation.mutate({ id: u.id, action: "remove" })}
                            >
                              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
                              Remove admin
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1"
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
    </div>
  );
}
