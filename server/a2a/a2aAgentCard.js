/**
 * CloudPilot A2A Agent Card definition.
 * Describes the agent's identity, capabilities, and endpoints for A2A discovery.
 */

const PORT = process.env.PORT || 3081;
const BASE_URL = process.env.A2A_BASE_URL || `http://localhost:${PORT}`;

export const agentCard = {
    name: 'CloudPilot',
    description:
        'CloudPilot is an AI-powered assistant with RAG-enhanced context. It answers questions grounded in your documents and knowledge base.',
    protocolVersion: '0.3.0',
    version: '1.0.0',
    url: `${BASE_URL}/a2a/jsonrpc`,
    skills: [
        {
            id: 'ask',
            name: 'Ask CloudPilot',
            description:
                'Ask one or more questions. CloudPilot uses RAG to retrieve relevant context from indexed documents and provides AI-powered answers.',
            tags: ['chat', 'rag', 'ai', 'question-answering'],
        },
    ],
    capabilities: {
        pushNotifications: false,
        streaming: true,
    },
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    additionalInterfaces: [
        { url: `${BASE_URL}/a2a/jsonrpc`, transport: 'JSONRPC' },
        { url: `${BASE_URL}/a2a/rest`, transport: 'HTTP+JSON' },
    ],
};
