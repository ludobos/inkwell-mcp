/**
 * Voice template loader — reads .md files and parses structure.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import type { VoiceTemplate } from './interface.js';

/**
 * Load all voice templates from a directory.
 * Each .md file becomes a template. Name derived from filename.
 */
export function loadVoiceTemplates(dir: string): VoiceTemplate[] {
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  return files.map(f => loadTemplate(join(dir, f)));
}

/**
 * Load a single voice template from a .md file.
 */
export function loadTemplate(filePath: string): VoiceTemplate {
  const raw = readFileSync(filePath, 'utf-8');
  const name = basename(filePath, '.md');

  // Parse sections from markdown
  const sections = parseSections(raw);

  return {
    name,
    description: sections.get('description') ?? extractFirstLine(raw),
    tone: sections.get('tone') ?? '',
    structure: extractBullets(sections.get('structure') ?? ''),
    style: extractBullets(sections.get('style') ?? ''),
    formatting: extractBullets(sections.get('formatting') ?? ''),
    raw,
  };
}

function parseSections(md: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = md.split('\n');
  let currentSection = '';
  let content: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)/);
    if (headerMatch) {
      if (currentSection && content.length) {
        sections.set(currentSection.toLowerCase(), content.join('\n').trim());
      }
      currentSection = headerMatch[1];
      content = [];
    } else {
      content.push(line);
    }
  }

  if (currentSection && content.length) {
    sections.set(currentSection.toLowerCase(), content.join('\n').trim());
  }

  return sections;
}

function extractBullets(text: string): string[] {
  return text
    .split('\n')
    .filter(l => l.trim().startsWith('-'))
    .map(l => l.replace(/^-\s*/, '').trim());
}

function extractFirstLine(md: string): string {
  const lines = md.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  return lines[0]?.trim() ?? '';
}
