---
name: gen-slides
description: Generate Marp presentation slides from a topic
allowed-tools: Write, Read, Bash
---

Generate a Marp-format slide deck about: $ARGUMENTS

Rules:
- File: slides/$ARGUMENTS.md
- Use Marp front matter (marp: true, theme, paginate)
- 10-15 slides with clear structure (title → agenda → content → summary)
- Include speaker notes (<!-- notes --> sections)
- Use code blocks and diagrams where appropriate
- Run `npx @marp-team/marp-cli slides/$ARGUMENTS.md -o slides/$ARGUMENTS.pdf` to generate PDF
