import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Shell } from "@/components/layout/Shell";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import PropertyNew from "@/pages/property-new";
import PropertyDetail from "@/pages/property-detail";
import PropertyEdit from "@/pages/property-edit";
import Calculator from "@/pages/calculator";
import Projections from "@/pages/projections";
import PropertiesList from "@/pages/properties";
import Communications from "@/pages/communications";
import PropertyCommunications from "@/pages/property-communications";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";

// REQUIRED — copy verbatim.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev (intentional), auto-set in prod.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "bottom" as const,
  },
  variables: {
    colorPrimary: "hsl(25,85%,45%)",
    colorForeground: "hsl(30,20%,15%)",
    colorMutedForeground: "hsl(30,15%,45%)",
    colorDanger: "hsl(0,84%,60%)",
    colorBackground: "hsl(45,30%,99%)",
    colorInput: "hsl(45,15%,85%)",
    colorInputForeground: "hsl(30,20%,15%)",
    colorNeutral: "hsl(45,15%,70%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0.25rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-xl w-[440px] max-w-full overflow-hidden shadow-lg",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[hsl(30,20%,15%)] font-bold",
    headerSubtitle: "text-[hsl(30,15%,45%)]",
    socialButtonsBlockButtonText: "text-[hsl(30,20%,15%)] font-medium",
    formFieldLabel: "text-[hsl(30,20%,15%)] font-medium text-sm",
    footerActionLink: "text-[hsl(25,85%,45%)] font-semibold hover:text-[hsl(25,85%,35%)]",
    footerActionText: "text-[hsl(30,15%,45%)]",
    dividerText: "text-[hsl(30,15%,55%)]",
    identityPreviewEditButton: "text-[hsl(25,85%,45%)]",
    formFieldSuccessText: "text-[hsl(150,50%,35%)]",
    alertText: "text-[hsl(30,20%,15%)]",
    logoBox: "flex justify-center",
    logoImage: "w-10 h-10",
    socialButtonsBlockButton: "border border-[hsl(45,15%,82%)] hover:bg-[hsl(45,15%,96%)]",
    formButtonPrimary: "bg-[hsl(25,85%,45%)] hover:bg-[hsl(25,85%,38%)] text-white font-semibold",
    formFieldInput: "border-[hsl(45,15%,82%)] bg-[hsl(45,30%,99%)] text-[hsl(30,20%,15%)]",
    footerAction: "bg-[hsl(45,15%,96%)]",
    dividerLine: "bg-[hsl(45,15%,85%)]",
    alert: "border-[hsl(45,15%,85%)]",
    otpCodeFieldInput: "border-[hsl(45,15%,82%)]",
    formFieldRow: "gap-2",
    main: "gap-4",
  },
};

// ── Sign-in / Sign-up pages ────────────────────────────────────────────────

function SignInPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[hsl(45,20%,97%)] px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[hsl(45,20%,97%)] px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

// ── Home: landing for guests, redirect to /app for signed-in ──────────────

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/app" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

// ── Protected app shell ────────────────────────────────────────────────────

function AppRoute() {
  return (
    <>
      <Show when="signed-in">
        <Shell>
          <Switch>
            <Route path="/app" component={Dashboard} />
            <Route path="/app/properties" component={PropertiesList} />
            <Route path="/app/properties/new" component={PropertyNew} />
            <Route path="/app/properties/:id/edit" component={PropertyEdit} />
            <Route path="/app/properties/:id" component={PropertyDetail} />
            <Route path="/app/projections" component={Projections} />
            <Route path="/app/communications/:id" component={PropertyCommunications} />
            <Route path="/app/communications" component={Communications} />
            <Route path="/app/calculator" component={Calculator} />
            <Route path="/app/settings" component={SettingsPage} />
            <Route component={NotFound} />
          </Switch>
        </Shell>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

// ── Cache invalidator on user change ──────────────────────────────────────

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

// ── Root ──────────────────────────────────────────────────────────────────

const queryClient = new QueryClient();

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back to RealTrack",
            subtitle: "Sign in to your portfolio",
          },
        },
        signUp: {
          start: {
            title: "Join RealTrack",
            subtitle: "Track your real estate portfolio",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/app/*?" component={AppRoute} />
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
