import { generateCurlSnippet } from './curl.js';
import { generateJavaSnippet } from './java.js';
import { generateNodeSnippet } from './node.js';
import { generatePythonSnippet } from './python.js';

export type SnippetInput = {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
};

export type GeneratedSnippets = { curl: string; node: string; python: string; java: string };

export function generateSnippets(input: SnippetInput): GeneratedSnippets {
  return {
    curl: generateCurlSnippet(input),
    node: generateNodeSnippet(input),
    python: generatePythonSnippet(input),
    java: generateJavaSnippet(input),
  };
}

export { generateCurlSnippet } from './curl.js';
export { generateJavaSnippet } from './java.js';
export { generateNodeSnippet } from './node.js';
export { generatePythonSnippet } from './python.js';
