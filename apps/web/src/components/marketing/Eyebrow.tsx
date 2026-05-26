export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm font-bold uppercase tracking-[0.24em] text-accent ${className}`}>{children}</p>;
}
