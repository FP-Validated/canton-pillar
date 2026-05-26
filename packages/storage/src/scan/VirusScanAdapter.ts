export type ScanState = 'pending'|'clean'|'infected';
export interface VirusScanAdapter { scan(key:string): Promise<{state: ScanState; signature?: string}>; }
export class DeterministicVirusScanAdapter implements VirusScanAdapter { async scan(key:string){ return key.includes('eicar') ? { state:'infected' as const, signature:'EICAR-Test-File' } : { state:'clean' as const }; } }
