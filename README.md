# CloudPilot

CloudPilot is an AI-powered assistant designed for intelligent, context-aware conversations. It leverages Retrieval-Augmented Generation (RAG) to provide responses grounded in your specific documents and includes full session historical tracking and token usage monitoring.

## ✨ Key Features

- 🧠 **RAG-Enhanced Chat**: Utilizes local pages and documents to provide context-rich AI responses.
- 🕒 **Session History**: Persistent storage of chat sessions, allowing you to resume conversations at any time.
- 📊 **Token Tracking**: Real-time monitoring of OpenAI token usage (prompt and completion) per session.
- 🔐 **Secure Authentication**: Simple JWT-based email authentication to protect your data.
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

## 🛠 Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Lucide React, TanStack Query
- **Backend**: Node.js, Express, OpenAI SDK, HuggingFace Transformers (for RAG)
- **Database**: Supabase (PostgreSQL)
- **Auth**: JSON Web Tokens (JWT)

## 📁 Project Structure

```text
├── server/             # Express backend
│   ├── routes/         # API endpoints
│   ├── services/       # AI and RAG logic
│   └── middleware/     # Auth and security
├── src/                # React frontend
│   ├── components/     # UI components
│   └── lib/            # API utilities
├── supabase/           # Database migrations and config
└── pages/              # Document storage for RAG context
```

## 📄 License

MIT
