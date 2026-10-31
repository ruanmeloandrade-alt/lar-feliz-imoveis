import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import BenefitsSection from "@/components/BenefitsSection";
import AnaliseSection from "@/components/AnaliseSection";
import HowItWorksSection from "@/components/HowItWorksSection";
import PropertiesSection from "@/components/PropertiesSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import FAQSection from "@/components/FAQSection";
import FinalCTASection from "@/components/FinalCTASection";
import Footer from "@/components/Footer";
import WhatsAppFloat from "@/components/WhatsAppFloat";

const Index = () => (
  <div className="vanessa-public">
    <Header />
    <main>
      <HeroSection />
      <BenefitsSection />
      <AnaliseSection />
      <HowItWorksSection />
      <PropertiesSection />


      <TestimonialsSection />
      <FAQSection />
      <FinalCTASection />
    </main>
    <Footer />
    <WhatsAppFloat />
  </div>
);

export default Index;
