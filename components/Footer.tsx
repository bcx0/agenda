export default function Footer() {
  return (
    <footer className="border-t border-border bg-background-elevated">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 text-sm text-white/70 md:flex-row md:items-center md:justify-between">
        <span className="tracking-widest uppercase">
          Mentions légales - Geoffrey Mahieu 2025
        </span>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-white">
            LinkedIn
          </a>
          <a href="#" className="hover:text-white">
            Instagram
          </a>
          <a href="#" className="hover:text-white">
            Youtube
          </a>
        </div>
      </div>
    </footer>
  );
}
