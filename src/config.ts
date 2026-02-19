/** Config loader + validation */

export interface InkwellConfig {
  name: string;
  description: string;
  watermark: string;
  database: {
    type: 'sqlite' | 'supabase';
    path?: string;
    supabaseUrl?: string;
    supabaseKey?: string;
  };
  auth: {
    enabled: boolean;
    ownerKey?: string;
  };
  tagPatterns?: Array<{
    name: string;
    category: string;
    pattern: string;
  }>;
}

const DEFAULT_CONFIG: InkwellConfig = {
  name: 'Inkwell Newsletter',
  description: 'Editorial intelligence MCP server',
  watermark: 'Source: Inkwell MCP',
  database: { type: 'sqlite', path: './data/inkwell.db' },
  auth: { enabled: false },
};

export function loadConfig(overrides?: Partial<InkwellConfig>): InkwellConfig {
  const config = { ...DEFAULT_CONFIG, ...overrides };

  if (config.database.type === 'sqlite' && !config.database.path) {
    config.database.path = './data/inkwell.db';
  }

  if (config.database.type === 'supabase') {
    if (!config.database.supabaseUrl || !config.database.supabaseKey) {
      throw new Error('Supabase config requires supabaseUrl and supabaseKey');
    }
  }

  return config;
}
