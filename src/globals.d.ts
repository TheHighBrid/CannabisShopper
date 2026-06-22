declare const process: {
  argv: string[];
  exitCode?: number;
};

declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
}
