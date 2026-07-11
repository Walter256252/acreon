import { Building2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-500">
      <div className="bg-muted/30 p-6 rounded-full mb-6">
        <Building2 className="w-16 h-16 text-muted-foreground opacity-50" />
      </div>
      <h1 className="text-4xl font-bold tracking-tight mb-2">404</h1>
      <p className="text-xl text-muted-foreground mb-8">This property could not be found.</p>
      <Button asChild size="lg">
        <Link href="/">Return to Dashboard</Link>
      </Button>
    </div>
  );
}
