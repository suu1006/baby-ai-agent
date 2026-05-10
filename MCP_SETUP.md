# MCP Setup

This project is configured to connect AI tools to the Supabase project through the official Supabase MCP server.

## Supabase Hosted MCP

The project ref is `zrsbfqibjifzcqjhwaoa`.

Configured files:

- `.mcp.json`: project-level MCP clients such as Claude Code
- `.cursor/mcp.json`: Cursor

The configured URL scopes access to this Supabase project and enables read-only database/docs tools:

```text
https://mcp.supabase.com/mcp?project_ref=zrsbfqibjifzcqjhwaoa&read_only=true&features=database,docs
```

After opening the project in an MCP-capable client, authenticate with Supabase when prompted. Then test with:

```text
Use MCP to list the public database tables.
```

## Direct Postgres MCP

Use this only when you specifically need a raw Postgres connection instead of the Supabase platform MCP.

Get the database password from Supabase Dashboard:

```text
Project Settings -> Database -> Connection string
```

Then configure your MCP client with the Postgres server:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://postgres.zrsbfqibjifzcqjhwaoa:<PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
      ]
    }
  }
}
```

Do not commit a real database password.
