export function CodeBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-auto rounded-3xl border border-slate-200 bg-ink p-5 text-xs leading-6 text-white shadow-sm">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
