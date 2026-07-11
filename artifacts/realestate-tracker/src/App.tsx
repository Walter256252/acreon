import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { Shell } from '@/components/layout/Shell';
import Dashboard from '@/pages/dashboard';
import PropertyNew from '@/pages/property-new';
import PropertyDetail from '@/pages/property-detail';
import PropertyEdit from '@/pages/property-edit';
import Calculator from '@/pages/calculator';
import Projections from '@/pages/projections';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/properties/new" component={PropertyNew} />
        <Route path="/properties/:id/edit" component={PropertyEdit} />
        <Route path="/properties/:id" component={PropertyDetail} />
        <Route path="/projections" component={Projections} />
        <Route path="/calculator" component={Calculator} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
