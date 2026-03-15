import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const STATE_FILE = resolve(process.cwd(), '.last-seq')

export function readLastSeq(): string | null {
  try {
    const content = readFileSync(STATE_FILE, 'utf-8').trim()
    return content || null
  } catch {
    return null
  }
}

export function writeLastSeq(seq: string): void {
  writeFileSync(STATE_FILE, seq, 'utf-8')
}
