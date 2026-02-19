# Newsletter Connectors

Inkwell supports importing from 4 newsletter platforms.

## Substack

**Method**: Export ZIP (no API available)

1. Go to your Substack dashboard > Settings > Export
2. Download the ZIP file
3. Extract it to a directory

```
npx inkwell-mcp import --platform substack --export-path ./substack-export/
```

Or via MCP:
```
import_newsletter(platform: "substack", export_path: "/path/to/export")
```

**What's imported**: title, subtitle, published date, open rate (computed from delivers/opens CSVs), editorial angle (extracted from HTML)

## Beehiiv

**Method**: REST API v2

1. Get your API key from Beehiiv dashboard > Settings > Integrations
2. Find your publication ID

```
import_newsletter(platform: "beehiiv", api_key: "your-key", publication_id: "pub_xxx")
```

**What's imported**: title, subtitle, content HTML, published date, open rate, click rate, web URL

## Ghost

**Method**: Content API or JSON export

### Content API
1. Create a Content API key in Ghost Admin > Settings > Integrations
2. Use your Ghost URL

```
import_newsletter(platform: "ghost", api_url: "https://myblog.ghost.io", api_key: "your-content-api-key")
```

### JSON Export
1. Go to Ghost Admin > Settings > Labs > Export
2. Download the JSON file

```
import_newsletter(platform: "ghost", export_path: "./ghost-export.json")
```

**What's imported**: title, excerpt, content HTML, published date, URL, tags, authors

## Kit (ConvertKit)

**Method**: REST API v3

1. Get your API secret from Kit dashboard > Settings > Advanced

```
import_newsletter(platform: "kit", api_key: "your-api-secret")
```

**What's imported**: subject (as title), description, content, published date, recipients, open rate, click rate

## Enrichment

After import, articles are automatically enriched (unless `enrich: false`):

- **Auto-tagging**: Matches content against configured tag patterns
- **Expert linking**: Detects expert names mentioned in article text
- **Signal detection**: Classifies editorial tone as bullish/bearish/neutral
- **TL;DR extraction**: Pulls bullet points from `<li>` and `<blockquote>` elements
