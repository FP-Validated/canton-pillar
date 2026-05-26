export function searchCommand(argv: string[]) { return { command: 'search', resource: argv[argv.indexOf('--resource')+1], query: argv[argv.indexOf('--query')+1] }; }
