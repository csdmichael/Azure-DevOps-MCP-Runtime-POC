# Azure DevOps MCP Server

An MCP (Model Context Protocol) server that exposes Azure DevOps Work Item and Git Repository operations as tools for AI assistants like GitHub Copilot.

Built from the [Azure DevOps OpenAPI Spec.yaml](Azure%20DevOps%20OpenAPI%20Spec.yaml) and registered in Azure API Center as an MCP runtime.

## Tools

| Tool | Description | Spec operationId |
|------|-------------|------------------|
| `createWorkItem` | Create a work item (Bug, Task, User Story, etc.) | `createWorkItem` |
| `getWorkItem` | Get a work item by ID | `getWorkItem` |
| `runWiqlQuery` | Run a WIQL query | `runWiqlQuery` |
| `listRepositories` | List Git repositories in a project | `listRepositories` |

## Prerequisites

- **Node.js** >= 18
- **Azure DevOps PAT** with scopes:
  - Work Items: Read & Write
  - Code: Read
- **Azure App Service** (Linux, Node 20 LTS)
- **Azure CLI** (for deployment)

## Environment Variables

| Name | Required | Description |
|------|----------|-------------|
| `AZURE_DEVOPS_ORG` | Yes | Organization name (`myorg`) or full URL (`https://dev.azure.com/myorg`) |
| `AZURE_DEVOPS_PAT` | Yes | Personal Access Token |
| `PORT` | No | Server port (defaults to `8080`, App Service injects this) |
| `NODE_ENV` | No | Set to `production` on App Service |

## Local Development

```bash
npm install

# Set environment variables
export AZURE_DEVOPS_ORG="your-org"
export AZURE_DEVOPS_PAT="your-pat"

# Start the server
npm start
```

Verify at https://azure-devops-mcp-poc.azurewebsites.net/ — should return:
```json
{
  "name": "Azure DevOps Services (Focused MCP Toolset)",
  "version": "1.0.0",
  "status": "running",
  "tools": ["createWorkItem", "getWorkItem", "runWiqlQuery", "listRepositories"]
}
```

## Deploy to Azure App Service

### 1. Configure App Service environment variables

```bash
az webapp config appsettings set \
  --name azure-devops-mcp-poc \
  --resource-group ai-myaacoub \
  --settings \
    AZURE_DEVOPS_ORG="https://dev.azure.com/your-org" \
    AZURE_DEVOPS_PAT="your-pat" \
    NODE_ENV="production"
```

### 2. Deploy

```bash
npm install
az webapp up --name azure-devops-mcp-poc --resource-group ai-myaacoub --runtime "NODE:20-lts"
```

### 3. Set startup command

```bash
az webapp config set \
  --name azure-devops-mcp-poc \
  --resource-group ai-myaacoub \
  --startup-file "node index.js"
```

### 4. Restart

```bash
az webapp restart --name azure-devops-mcp-poc --resource-group ai-myaacoub
```

## VS Code Configuration

Add to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "azure-devops-mcp": {
      "type": "sse",
      "url": "https://azure-devops-mcp-poc.azurewebsites.net/sse"
    }
  }
}
```

Then reload VS Code (`Ctrl+Shift+P` > "Developer: Reload Window").

## API Center Integration

This MCP server is registered in Azure API Center (`api-center-myaacoub-ai`) as:
- **API name:** `azure-devops-mcp`
- **Kind:** `mcp`
- **Version:** `v1`
- **Deployment runtime URI:** `https://azure-devops-mcp-poc.azurewebsites.net`
- **OpenAPI spec:** [Azure DevOps OpenAPI Spec.yaml](Azure%20DevOps%20OpenAPI%20Spec.yaml)

## CI/CD

A GitHub Actions workflow is included at `.github/workflows/deploy.yml`. It deploys automatically on push to `main` when `index.js`, `package.json`, or `package-lock.json` change.

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `AZURE_CREDENTIALS` | Service principal JSON for `az login` |
| `AZURE_DEVOPS_PAT` | Azure DevOps Personal Access Token |

To create the `AZURE_CREDENTIALS` secret:
```bash
az ad sp create-for-rbac --name "github-deploy-mcp" \
  --role Contributor \
  --scopes /subscriptions/{sub-id}/resourceGroups/ai-myaacoub \
  --json-auth
```

Copy the JSON output and add it as a GitHub secret named `AZURE_CREDENTIALS`.

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/sse` | GET | SSE transport (VS Code connects here) |
| `/messages` | POST | Message handler for SSE sessions |

## License

This project is licensed under the [MIT License](LICENSE).
