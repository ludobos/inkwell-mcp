# Voice Templates

Voice templates define writing style for the `draft_article` tool.

## Structure

Templates are Markdown files in `templates/voice/`. Each file has sections:

```markdown
# Template Name

## Tone
Description of the overall voice

## Structure
- Point about how to structure articles
- Another structural guideline

## Style
- Writing style rule
- Another rule

## Formatting
- Formatting convention
- Another convention
```

## Built-in Templates

| Template | Tone |
|----------|------|
| `default` | Professional, clear, direct |
| `example-analytical` | Data-driven, authoritative, Bloomberg-style |
| `example-casual` | Conversational, enthusiastic, relatable |

## Creating Custom Templates

1. Create a `.md` file in `templates/voice/`
2. Follow the structure above
3. The filename (minus `.md`) becomes the template name
4. Use `list_voice_templates` to verify it's loaded

## Using in Draft

```
draft_article(target_article: "article-id", voice: "my-custom-template")
```
