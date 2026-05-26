type CodePaneProps = {
  code: string | object;
  language?: string;
};

export function CodePane({ code, language = 'json' }: CodePaneProps) {
  const value = typeof code === 'string' ? code : JSON.stringify(code, null, 2);
  return (
    <pre className="overflow-x-auto rounded-2xl bg-ink p-4 text-sm leading-6 text-white shadow-sm" data-language={language}>
      <code>{value}</code>
    </pre>
  );
}
