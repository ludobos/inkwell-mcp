/** Voice template interface */

export interface VoiceTemplate {
  name: string;
  description: string;
  tone: string;
  structure: string[];
  style: string[];
  formatting: string[];
  /** Full markdown content of the template */
  raw: string;
}
