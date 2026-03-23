export default function Footer() {
  return (
    <footer className="border-t border-border bg-background-elevated">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 text-sm text-white/70 md:flex-row md:items-center md:justify-between">
        <span className="tracking-widest uppercase">
          Mentions légales - Geoffrey Mahieu 2026
        </span>
        <div className="flex items-center gap-4">
          <a href="https://www.linkedin.com/in/geoffrey-mahieu" target="_blank" rel="noopener noreferrer" className="hover:text-white">
            LinkedIn
          </a>
          <a href="https://www.instagram.com/geoffreymahieu" target="_blank" rel="noopener noreferrer" className="hover:text-white">
            Instagram
          </a>
          <a href="https://www.youtube.com/@geoffreymahieu" target="_blank" rel="noopener noreferrer" className="hover:text-white">
            Youtube
          </a>
        </div>
      </div>
    </footer>
  );
}
