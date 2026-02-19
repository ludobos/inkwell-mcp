/** Newsletter connector interface */

export interface ImportedArticle {
  title: string;
  subtitle?: string;
  content?: string;
  status: 'draft' | 'published' | 'archived';
  type: 'edition' | 'analysis' | 'special';
  number?: number;
  published_at?: string;
  views?: number;
  open_rate?: number;
  click_rate?: number;
  url?: string;
  editorial_angle?: string;
  /** External ID from source platform */
  external_id?: string;
}

export interface ConnectorConfig {
  /** Path to export directory or API credentials */
  exportPath?: string;
  apiKey?: string;
  apiUrl?: string;
  publicationId?: string;
}

export interface ImportResult {
  articles: ImportedArticle[];
  stats: {
    total: number;
    imported: number;
    skipped: number;
    errors: number;
  };
  messages: string[];
}

export interface NewsletterConnector {
  platform: string;
  displayName: string;
  import(config: ConnectorConfig): Promise<ImportResult>;
  validate(config: ConnectorConfig): Promise<{ valid: boolean; message: string }>;
}
