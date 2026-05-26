export function reportsCommand(argv: string[]) { const action = argv[0] ?? 'list'; return { command: 'reports', action }; }
