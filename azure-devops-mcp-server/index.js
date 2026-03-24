const express = require("express");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { z } = require("zod");

const app = express();
const PORT = process.env.PORT || 8080;

// Azure DevOps config — matches servers[0] in Azure DevOps OpenAPI Spec.yaml
// servers:
//   - url: https://dev.azure.com/{organization}
const ADO_ORG = process.env.AZURE_DEVOPS_ORG; // supports full URL or just org name
const ADO_PAT = process.env.AZURE_DEVOPS_PAT;

function getBaseUrl() {
  // Accept either "https://dev.azure.com/myorg" or just "myorg"
  if (ADO_ORG.startsWith("http")) {
    return ADO_ORG.replace(/\/+$/, "");
  }
  return `https://dev.azure.com/${ADO_ORG}`;
}

// security: basicAuth — PAT with blank username per spec
function getAuthHeader() {
  const token = Buffer.from(`:${ADO_PAT}`).toString("base64");
  return `Basic ${token}`;
}

async function adoFetch(path, options = {}) {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": options.contentType || "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure DevOps API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Store active transports for SSE
const transports = {};

function createServer() {
  const server = new McpServer({
    name: "Azure DevOps Services (Focused MCP Toolset)",
    version: "1.0.0",
  });

  // ---------------------------------------------------------------
  // operationId: createWorkItem
  // POST /{project}/_apis/wit/workitems/{type}?api-version=7.2-preview.3
  // requestBody: application/json-patch+json — JsonPatchDocument
  // ---------------------------------------------------------------
  server.tool(
    "createWorkItem",
    "Create a work item",
    {
      project: z.string().describe("Azure DevOps project name"),
      type: z.string().describe("Bug, Task, User Story, etc."),
      body: z
        .array(
          z.object({
            op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
            path: z.string(),
            value: z.any().optional(),
          })
        )
        .describe("JSON Patch document (array of {op, path, value})"),
    },
    async ({ project, type, body }) => {
      const result = await adoFetch(
        `/${encodeURIComponent(project)}/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=7.2-preview.3`,
        {
          method: "POST",
          contentType: "application/json-patch+json",
          body: JSON.stringify(body),
        }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------
  // operationId: getWorkItem
  // GET /{project}/_apis/wit/workitems/{id}?api-version=7.2
  // ---------------------------------------------------------------
  server.tool(
    "getWorkItem",
    "Get a work item",
    {
      project: z.string().describe("Azure DevOps project name"),
      id: z.number().describe("Work item ID"),
    },
    async ({ project, id }) => {
      const result = await adoFetch(
        `/${encodeURIComponent(project)}/_apis/wit/workitems/${id}?api-version=7.2`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------
  // operationId: runWiqlQuery
  // POST /{project}/_apis/wit/wiql?api-version=7.2
  // requestBody: application/json — WiqlRequest { query: string }
  // ---------------------------------------------------------------
  server.tool(
    "runWiqlQuery",
    "Run a WIQL query",
    {
      project: z.string().describe("Azure DevOps project name"),
      query: z.string().describe("WIQL query string"),
    },
    async ({ project, query }) => {
      const result = await adoFetch(
        `/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.2`,
        {
          method: "POST",
          body: JSON.stringify({ query }),
        }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------
  // operationId: listRepositories
  // GET /{project}/_apis/git/repositories?api-version=7.2
  // ---------------------------------------------------------------
  server.tool(
    "listRepositories",
    "List repositories in a project",
    {
      project: z.string().describe("Azure DevOps project name"),
    },
    async ({ project }) => {
      const result = await adoFetch(
        `/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.2`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  return server;
}

// SSE endpoint — VS Code connects here
app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;

  res.on("close", () => {
    delete transports[transport.sessionId];
  });

  const server = createServer();
  await server.connect(transport);
});

// Messages endpoint for SSE transport
app.post("/messages", express.json(), async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (!transport) {
    res.status(400).json({ error: "Invalid session" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

// Health check
app.get("/", (req, res) => {
  res.json({
    name: "Azure DevOps Services (Focused MCP Toolset)",
    version: "1.0.0",
    status: "running",
    tools: ["createWorkItem", "getWorkItem", "runWiqlQuery", "listRepositories"],
  });
});

app.listen(PORT, () => {
  console.log(`Azure DevOps MCP Server running on port ${PORT}`);
  if (!ADO_ORG || !ADO_PAT) {
    console.warn("WARNING: Set AZURE_DEVOPS_ORG and AZURE_DEVOPS_PAT environment variables");
  }
});
