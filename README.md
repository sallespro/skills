# CloudPilot

CloudPilot is an AI-powered assistant designed for intelligent, context-aware conversations. It leverages Retrieval-Augmented Generation (RAG) to provide responses grounded in your specific documents and includes full session historical tracking and token usage monitoring.

## ✨ Key Features

- 🧠 **RAG-Enhanced Chat**: Utilizes local pages and documents to provide context-rich AI responses.
- 🕒 **Session History**: Persistent storage of chat sessions, allowing you to resume conversations at any time.
- 📊 **Token Tracking**: Real-time monitoring of OpenAI token usage (prompt and completion) per session.
- 🔐 **Secure Authentication**: Simple JWT-based email authentication to protect your data.
- 🤖 **A2A Protocol Support**: Full implementation of the Agent-to-Agent protocol for inter-agent communication.
- 🔌 **MCP Integration**: Model Context Protocol (MCP) server integration, used both externally and internally by the A2A layer.
- ⚡ **Modern Stack**: Built with React, Vite, Express, and Supabase.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- Supabase account and CLI
- OpenAI API Key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/sallespro/4um.git
   cd 4um
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables (`.env`):
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   SUPABASE_ACCESS_TOKEN=your_access_token
   OPENAI_API_KEY=your_openai_api_key
   JWT_SECRET=your_secret_key
   MCP_URL=http://localhost:3081/api/mcp
   A2A_DEFAULT_EMAIL=cloud2pilot@gmail.com
   A2A_BASE_URL=http://localhost:3081
   ```

4. Apply database migrations:
   ```bash
   supabase link --project-ref your_project_ref
   supabase db push
   ```

### Running the Project

Start both the frontend and backend servers:

```bash
npm run dev:all
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3081
- **Agent Card**: http://localhost:3081/.well-known/agent-card.json
- **A2A JSON-RPC**: http://localhost:3081/a2a/jsonrpc

## 🤖 A2A Protocol & MCP

CloudPilot natively supports the **Agent-to-Agent (A2A)** protocol, enabling it to communicate with other agents and specialized tools.

### Architecture
The A2A layer acts as a bridge to the internal **Model Context Protocol (MCP)** server:
1. **A2A Client** sends a message to the A2A JSON-RPC endpoint.
2. **A2A Executor** translates the request and acts as an MCP client.
3. **MCP Server** processes the request using the `ask` tool (RAG + OpenAI).
4. **Streaming Updates** are pushed back to the client via SSE.

### Using the A2A Panel
The CloudPilot UI includes a dedicated A2A panel. Toggle between standard **Chat** and the **A2A** view in the right sidebar to start agent-to-agent tasks and monitor streaming updates in real-time.

## 🛠 Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Lucide React, TanStack Query
- **Backend**: Node.js, Express, OpenAI SDK, HuggingFace Transformers (for RAG)
- **Database**: Supabase (PostgreSQL)
- **Auth**: JSON Web Tokens (JWT)

## 📁 Project Structure

```text
├── server/             # Express backend
│   ├── a2a/            # A2A protocol implementation
│   ├── mcp/            # MCP server implementation
│   ├── routes/         # API endpoints (including MCP and A2A)
│   ├── services/       # AI and RAG logic
│   └── middleware/     # Auth and security
├── src/                # React frontend
│   ├── components/     # UI components (including A2APanel)
│   └── lib/            # API utilities
├── supabase/           # Database migrations and config
└── pages/              # Document storage for RAG context
```

## 📄 License

MIT
