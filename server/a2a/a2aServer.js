import { v4 as uuidv4 } from 'uuid';
import {
    DefaultRequestHandler,
    InMemoryTaskStore,
} from '@a2a-js/sdk/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { agentCard } from './a2aAgentCard.js';

const PORT = process.env.PORT || 3081;
const MCP_URL = process.env.MCP_URL || `http://localhost:${PORT}/api/mcp`;

// Default email for A2A-originated requests (no auth context available)
const A2A_DEFAULT_EMAIL = process.env.A2A_DEFAULT_EMAIL || 'cloud2pilot@gmail.com';

/**
 * CloudPilot A2A Agent Executor.
 * Processes incoming A2A messages by delegating to the MCP server's `ask` tool
 * via an in-process MCP client, streaming status updates back through the event bus.
 */
class CloudPilotExecutor {
    constructor() {
        this._abortControllers = new Map();
    }

    async execute(requestContext, eventBus) {
        const { taskId, contextId, userMessage, task } = requestContext;

        // Set up cancellation support
        const abortController = new AbortController();
        this._abortControllers.set(taskId, abortController);

        let mcpClient = null;

        try {
            // 1. Create and publish initial task if it doesn't exist
            if (!task) {
                const initialTask = {
                    kind: 'task',
                    id: taskId,
                    contextId: contextId,
                    status: {
                        state: 'submitted',
                        timestamp: new Date().toISOString(),
                    },
                    history: [userMessage],
                };
                eventBus.publish(initialTask);
            }

            if (abortController.signal.aborted) {
                this._publishCancelled(eventBus, taskId, contextId);
                return;
            }

            // 2. Transition to 'working' state
            eventBus.publish({
                kind: 'status-update',
                taskId,
                contextId,
                status: {
                    state: 'working',
                    timestamp: new Date().toISOString(),
                    message: {
                        kind: 'message',
                        messageId: uuidv4(),
                        role: 'agent',
                        parts: [{ kind: 'text', text: 'Connecting to MCP server and processing your request...' }],
                        contextId,
                    },
                },
                final: false,
            });

            // 3. Extract user question from message parts
            const question = this._extractTextFromMessage(userMessage);
            if (!question) {
                this._publishError(eventBus, taskId, contextId, 'No text content found in message.');
                return;
            }

            if (abortController.signal.aborted) {
                this._publishCancelled(eventBus, taskId, contextId);
                return;
            }

            // 4. Connect to MCP server as a client
            mcpClient = new Client({ name: 'a2a-mcp-bridge', version: '1.0.0' });
            const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
            await mcpClient.connect(transport);

            if (abortController.signal.aborted) {
                this._publishCancelled(eventBus, taskId, contextId);
                return;
            }

            // 5. Call the MCP `ask` tool
            const result = await mcpClient.callTool({
                name: 'ask',
                arguments: {
                    email: A2A_DEFAULT_EMAIL,
                    questions: question,
                },
            });

            if (abortController.signal.aborted) {
                this._publishCancelled(eventBus, taskId, contextId);
                return;
            }

            // 6. Extract response text from MCP tool result
            const responseContent = result.content
                ?.filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('\n') || 'No response received.';

            if (result.isError) {
                this._publishError(eventBus, taskId, contextId, responseContent);
                return;
            }

            // 7. Publish the response artifact
            eventBus.publish({
                kind: 'artifact-update',
                taskId,
                contextId,
                artifact: {
                    artifactId: `response-${uuidv4().slice(0, 8)}`,
                    name: 'AI Response',
                    parts: [{ kind: 'text', text: responseContent }],
                },
            });

            // 8. Publish final 'completed' status
            eventBus.publish({
                kind: 'status-update',
                taskId,
                contextId,
                status: {
                    state: 'completed',
                    timestamp: new Date().toISOString(),
                },
                final: true,
            });

            eventBus.finished();
        } catch (err) {
            console.error('A2A Executor error:', err);
            this._publishError(eventBus, taskId, contextId, err.message);
        } finally {
            this._abortControllers.delete(taskId);
            // Clean up MCP client connection
            if (mcpClient) {
                try { await mcpClient.close(); } catch { /* ignore */ }
            }
        }
    }

    async cancelTask(taskId) {
        const controller = this._abortControllers.get(taskId);
        if (controller) {
            controller.abort();
        }
    }

    /**
     * Extract plain text from an A2A message's parts.
     */
    _extractTextFromMessage(message) {
        if (!message || !message.parts) return null;
        return message.parts
            .filter((p) => p.kind === 'text')
            .map((p) => p.text)
            .join('\n')
            .trim() || null;
    }

    /**
     * Publish a 'failed' status update.
     */
    _publishError(eventBus, taskId, contextId, errorMessage) {
        eventBus.publish({
            kind: 'status-update',
            taskId,
            contextId,
            status: {
                state: 'failed',
                timestamp: new Date().toISOString(),
                message: {
                    kind: 'message',
                    messageId: uuidv4(),
                    role: 'agent',
                    parts: [{ kind: 'text', text: `Error: ${errorMessage}` }],
                    contextId,
                },
            },
            final: true,
        });
        eventBus.finished();
    }

    /**
     * Publish a 'canceled' status update.
     */
    _publishCancelled(eventBus, taskId, contextId) {
        eventBus.publish({
            kind: 'status-update',
            taskId,
            contextId,
            status: {
                state: 'canceled',
                timestamp: new Date().toISOString(),
            },
            final: true,
        });
        eventBus.finished();
    }
}

/**
 * Create the A2A request handler singleton.
 * Uses InMemoryTaskStore for task state management.
 */
export function createA2ARequestHandler() {
    const executor = new CloudPilotExecutor();
    const taskStore = new InMemoryTaskStore();
    return new DefaultRequestHandler(agentCard, taskStore, executor);
}
