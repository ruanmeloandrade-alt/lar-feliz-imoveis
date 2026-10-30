import { createFileRoute } from "@tanstack/react-router";
import { MouseGlow, NavBar } from "@/components/landing/shell";
import { Hero } from "@/components/landing/hero";
import { DashboardShowcase } from "@/components/landing/dashboard-showcase";
import { Agents } from "@/components/landing/agents";
import { CrmPipeline, PaidTraffic } from "@/components/landing/pipeline-traffic";
import { SocialMedia } from "@/components/landing/social-call";
import { Analytics, Automations, Integrations } from "@/components/landing/analytics-automations";
import { Security, Plans, FreeTrial, FAQ, Footer } from "@/components/landing/closing";
import { Economy } from "@/components/landing/economy";
import { SdrChatWidget } from "@/components/landing/sdr-chat-widget";
import { LandingI18nProvider } from "@/lib/landing-i18n";

export const Route = createFileRoute("/completa")({
  head: () => ({
    meta: [
      { title: "Vanessa Simoni, Plataforma completa (preview)" },
      { name: "description", content: "Preview da landing completa Vanessa Simoni, todos os módulos e agentes IA." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LandingCompleta,
});

function LandingCompleta() {
  return (
    <LandingI18nProvider>
      <div className="mkton-landing relative min-h-screen">
        <MouseGlow />
        <NavBar />
        <main className="relative z-10">
          <Hero />
          <DashboardShowcase />
          <Agents />
          <CrmPipeline />
          <PaidTraffic />
          <SocialMedia />
          <Analytics />
          <Automations />
          <Integrations />
          <Security />
          <Economy />
          <Plans />
          <FreeTrial />
          <FAQ />
        </main>
        <Footer />
        <SdrChatWidget />
      </div>
    </LandingI18nProvider>
  );
}
