export function JsonInspector({ value }: { value: unknown }) { return <pre className="json-inspector">{JSON.stringify(value, null, 2)}</pre>; }
