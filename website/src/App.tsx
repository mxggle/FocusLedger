import { AssistantShowcase } from "./components/AssistantShowcase";
import { Download } from "./components/Download";
import { FeatureGrid } from "./components/FeatureGrid";
import { Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { McpShowcase } from "./components/McpShowcase";
import { Nav } from "./components/Nav";
import { ScreensGallery } from "./components/ScreensGallery";
import { Workflow } from "./components/Workflow";

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Nav />
      <main>
        <Hero />
        <AssistantShowcase />
        <Workflow />
        <Features />
        <ScreensGallery />
        <McpShowcase />
        <FeatureGrid />
        <Download />
      </main>
      <Footer />
    </div>
  );
}
