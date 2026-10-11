import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { RouteTransition } from "@/components/motion/route-transition";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background">
      {/* Instrument grid behind everything; hidden entirely under reduced motion
          by the rule in globals.css, so it is ambience and never a distraction. */}
      <div
        aria-hidden
        className="grid-overlay pointer-events-none absolute inset-0"
      />

      <Sidebar />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="container mx-auto max-w-7xl p-6">
            <RouteTransition>{children}</RouteTransition>
          </div>
        </main>
      </div>
    </div>
  );
}
