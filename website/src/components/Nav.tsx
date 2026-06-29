import { Download, Github } from "lucide-react";
import { useEffect, useState } from "react";
import { DOWNLOAD, NAV_LINKS, SITE } from "../lib/site";
import { cn } from "../lib/cn";
import { ButtonLink } from "./ui/Button";
import { Logo } from "./ui/Logo";
import { ThemeToggle } from "./ui/ThemeToggle";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "border-b border-border glass" : "border-b border-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={SITE.repo}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
            className="hidden h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground sm:grid"
          >
            <Github size={17} />
          </a>
          <ThemeToggle />
          <ButtonLink href="#download" className="ml-1">
            <Download size={16} /> Download
          </ButtonLink>
        </div>
      </div>
      <a href={DOWNLOAD.releases} className="sr-only">
        Download Yolo
      </a>
    </header>
  );
}
