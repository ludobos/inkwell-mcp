import type { InkwellConfig } from './src/config.js';

const config: InkwellConfig = {
  name: 'My Newsletter',
  description: 'Editorial intelligence for my newsletter',
  watermark: 'Source: My Newsletter',

  database: {
    type: 'sqlite',
    path: './data/inkwell.db',
  },

  auth: {
    enabled: false,
  },

  tagPatterns: [
    { name: 'AI', category: 'tech', pattern: '\\bAI|artificial intelligence\\b' },
    { name: 'Funding', category: 'business', pattern: '\\b(raised|funding|series [A-Z])\\b' },
  ],
};

export default config;
