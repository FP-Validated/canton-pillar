export function exportsCommand(argv: string[]) { const action = argv[0] ?? 'list'; return { command: 'exports', action }; }
