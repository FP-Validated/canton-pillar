import { readFileSync } from 'node:fs';
export interface SecretProvider { get(name: string): Promise<string | undefined>; put?(name: string, value: string): Promise<void>; }
export class EnvSecretProvider implements SecretProvider { async get(name: string) { return process.env[name]; } }
export class FileSecretProvider implements SecretProvider { constructor(private basePath: string) {} async get(name: string) { return readFileSync(`${this.basePath}/${name}`, 'utf8').trim(); } }
export class VaultSecretProvider implements SecretProvider { constructor(private values = new Map<string,string>()) {} async get(name: string) { return this.values.get(name); } async put(name: string, value: string) { this.values.set(name, value); } }
