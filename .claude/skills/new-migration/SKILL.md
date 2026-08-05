---
name: new-migration
description: Generate a Supabase migration file
allowed-tools: Write, Read, Bash
---

Generate a Supabase migration for: $ARGUMENTS

Rules:
- File: supabase/migrations/YYYYMMDD_$ARGUMENTS.sql
- Always include RLS policies
- Include appropriate indexes
- Add comments explaining each table/column
