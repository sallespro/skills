import { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, X, CheckCircle2, AlertCircle, Clock, Zap, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

/**
 * A2A Panel — sends messages to the local A2A agent via the REST API
 * and streams task updates via SSE (sendMessageStream equivalent).
 */

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:3081';

// Task state visual configuration
const TASK_STATES = {
    submitted: { label: 'Submitted', color: 'text-blue-500', bg: 'bg-blue-500/10', icon: Clock },
    working: { label: 'Working', color: 'text-amber-500', bg: 'bg-amber-500/10', icon: Loader2 },
    completed: { label: 'Completed', color: 'text-green-500', bg: 'bg-green-500/10', icon: CheckCircle2 },
    failed: { label: 'Failed', color: 'text-red-500', bg: 'bg-red-500/10', icon: AlertCircle },
    canceled: { label: 'Canceled', color: 'text-muted-foreground', bg: 'bg-muted', icon: X },
};

function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export default function A2APanel({ onClose }) {
    const [input, setInput] = useState('');
    const [conversations, setConversations] = useState([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const scrollRef = useRef(null);
    const abortRef = useRef(null);

    // Auto-scroll on new content
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [conversations]);

    /**
     * Send a message to the A2A agent via JSON-RPC and consume the SSE
     * stream response for real-time task updates.
     */
    async function sendMessage(messageText) {
        if (!messageText.trim() || isStreaming) return;

        const messageId = generateId();

        // Add user message to conversations
        const userEntry = {
            id: generateId(),
            type: 'user',
            text: messageText,
            timestamp: new Date().toISOString(),
        };

        // Add a placeholder for the agent's response
        const taskEntry = {
            id: generateId(),
            type: 'task',
            taskId: null,
            status: null,
            statusMessage: null,
            artifacts: [],
            events: [],
            timestamp: new Date().toISOString(),
        };

        setConversations(prev => [...prev, userEntry, taskEntry]);
        setIsStreaming(true);

        const taskEntryId = taskEntry.id;

        try {
            // Build JSON-RPC request
            const jsonRpcRequest = {
                jsonrpc: '2.0',
                method: 'message/send',
                id: generateId(),
                params: {
                    message: {
                        messageId,
                        role: 'user',
                        parts: [{ kind: 'text', text: messageText }],
                        kind: 'message',
                    },
                },
            };

            const abortController = new AbortController();
            abortRef.current = abortController;

            const response = await fetch(`${API_BASE}/a2a/jsonrpc`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify(jsonRpcRequest),
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`Request failed: ${response.status}`);
            }

            const contentType = response.headers.get('content-type') || '';

            if (contentType.includes('text/event-stream')) {
                // Stream SSE response
                await consumeSSEStream(response, taskEntryId);
            } else {
                // Single JSON-RPC response
                const data = await response.json();
                handleJsonRpcResponse(data, taskEntryId);
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error('A2A request failed:', err);
            setConversations(prev =>
                prev.map(c =>
                    c.id === taskEntryId
                        ? {
                            ...c,
                            status: 'failed',
                            statusMessage: err.message,
                        }
                        : c
                )
            );
        } finally {
            setIsStreaming(false);
            abortRef.current = null;
        }
    }

    /**
     * Consume an SSE stream from the A2A server response.
     */
    async function consumeSSEStream(response, taskEntryId) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6).trim();
                    if (!dataStr || dataStr === '[DONE]') continue;

                    try {
                        const jsonRpcResponse = JSON.parse(dataStr);
                        handleJsonRpcResponse(jsonRpcResponse, taskEntryId);
                    } catch {
                        // Skip malformed events
                    }
                }
            }
        }
    }

    /**
     * Handle a JSON-RPC response and update the conversation state.
     */
    function handleJsonRpcResponse(data, taskEntryId) {
        if (data.error) {
            setConversations(prev =>
                prev.map(c =>
                    c.id === taskEntryId
                        ? { ...c, status: 'failed', statusMessage: data.error.message }
                        : c
                )
            );
            return;
        }

        const result = data.result;
        if (!result) return;

        setConversations(prev =>
            prev.map(c => {
                if (c.id !== taskEntryId) return c;

                const updated = { ...c };

                if (result.kind === 'task') {
                    updated.taskId = result.id;
                    updated.status = result.status?.state || 'submitted';
                    updated.statusMessage = extractMessageText(result.status?.message);
                    if (result.artifacts) {
                        updated.artifacts = result.artifacts;
                    }
                } else if (result.kind === 'status-update') {
                    updated.status = result.status?.state || updated.status;
                    updated.statusMessage = extractMessageText(result.status?.message) || updated.statusMessage;
                    updated.events = [
                        ...updated.events,
                        {
                            type: 'status',
                            state: result.status?.state,
                            message: extractMessageText(result.status?.message),
                            timestamp: result.status?.timestamp,
                        },
                    ];
                } else if (result.kind === 'artifact-update') {
                    const artifact = result.artifact;
                    if (artifact) {
                        updated.artifacts = [
                            ...updated.artifacts.filter(a => a.artifactId !== artifact.artifactId),
                            artifact,
                        ];
                        updated.events = [
                            ...updated.events,
                            {
                                type: 'artifact',
                                name: artifact.name || artifact.artifactId,
                                timestamp: new Date().toISOString(),
                            },
                        ];
                    }
                } else if (result.kind === 'message') {
                    // Direct message response (non-task)
                    const text = extractMessageText(result);
                    updated.status = 'completed';
                    updated.artifacts = [
                        {
                            artifactId: 'direct-response',
                            name: 'Response',
                            parts: [{ kind: 'text', text }],
                        },
                    ];
                }

                return updated;
            })
        );
    }

    /**
     * Extract text content from an A2A Message object.
     */
    function extractMessageText(message) {
        if (!message) return null;
        if (typeof message === 'string') return message;
        if (message.parts) {
            return message.parts
                .filter(p => p.kind === 'text')
                .map(p => p.text)
                .join('\n');
        }
        return null;
    }

    function handleSubmit(e) {
        e.preventDefault();
        if (!input.trim() || isStreaming) return;
        sendMessage(input);
        setInput('');
    }

    function handleCancel() {
        if (abortRef.current) {
            abortRef.current.abort();
        }
    }

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/20">
                        <Zap className="w-4 h-4 text-violet-500" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm">A2A Agent</h3>
                        <p className="text-[10px] text-muted-foreground">Agent-to-Agent Protocol</p>
                    </div>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Conversation Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth" ref={scrollRef}>
                {conversations.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50">
                        <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 mb-4">
                            <Bot className="w-8 h-8 text-violet-500/60" />
                        </div>
                        <p className="text-sm font-medium">CloudPilot A2A Agent</p>
                        <p className="text-xs mt-1 text-center max-w-[200px]">
                            Send a message to start a task via the A2A protocol
                        </p>
                    </div>
                )}

                {conversations.map(entry => {
                    if (entry.type === 'user') {
                        return (
                            <div key={entry.id} className="flex justify-end">
                                <div className="rounded-xl px-4 py-2.5 text-sm max-w-[85%] bg-primary text-primary-foreground">
                                    <p className="whitespace-pre-wrap">{entry.text}</p>
                                </div>
                            </div>
                        );
                    }

                    if (entry.type === 'task') {
                        const stateConfig = TASK_STATES[entry.status] || TASK_STATES.submitted;
                        const StateIcon = stateConfig.icon;
                        const isWorking = entry.status === 'working' || entry.status === 'submitted';

                        return (
                            <div key={entry.id} className="flex gap-3 justify-start">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                                    <Bot className="w-4 h-4 text-violet-500" />
                                </div>
                                <div className="flex-1 max-w-[85%] space-y-2">
                                    {/* Task Status Badge */}
                                    {entry.status && (
                                        <div className={cn(
                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                                            stateConfig.bg, stateConfig.color
                                        )}>
                                            <StateIcon className={cn("w-3 h-3", isWorking && "animate-spin")} />
                                            {stateConfig.label}
                                        </div>
                                    )}

                                    {/* Status message */}
                                    {entry.statusMessage && isWorking && (
                                        <div className="text-xs text-muted-foreground italic px-1">
                                            {entry.statusMessage}
                                        </div>
                                    )}

                                    {/* Event timeline */}
                                    {entry.events.length > 0 && (
                                        <div className="pl-2 border-l-2 border-border/50 space-y-1.5 py-1">
                                            {entry.events.map((evt, i) => (
                                                <div key={i} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                                    {evt.type === 'status' ? (
                                                        <div className={cn("w-1.5 h-1.5 rounded-full", TASK_STATES[evt.state]?.color || 'text-muted-foreground')} style={{ backgroundColor: 'currentColor' }} />
                                                    ) : (
                                                        <FileText className="w-3 h-3 text-violet-500" />
                                                    )}
                                                    <span>
                                                        {evt.type === 'status'
                                                            ? `Status → ${TASK_STATES[evt.state]?.label || evt.state}`
                                                            : `Artifact: ${evt.name}`
                                                        }
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Artifacts / Response */}
                                    {entry.artifacts.map((artifact, i) => (
                                        <div key={artifact.artifactId || i} className="rounded-xl bg-card border border-border overflow-hidden">
                                            {artifact.name && (
                                                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 bg-muted/30">
                                                    <FileText className="w-3 h-3 text-muted-foreground" />
                                                    <span className="text-[11px] font-medium text-muted-foreground">
                                                        {artifact.name}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="px-4 py-2.5 text-sm">
                                                {artifact.parts?.map((part, j) => (
                                                    <div key={j}>
                                                        {part.kind === 'text' && (
                                                            <article className="prose prose-sm dark:prose-invert max-w-none prose-p:text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground">
                                                                <ReactMarkdown>{part.text}</ReactMarkdown>
                                                            </article>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}

                                    {/* Loading indicator while working */}
                                    {isWorking && entry.artifacts.length === 0 && (
                                        <div className="rounded-xl px-4 py-2.5 bg-card border border-border">
                                            <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    }

                    return null;
                })}

                <div className="h-20" />
            </div>

            {/* Input Area */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-8 pb-4 px-4">
                {isStreaming && (
                    <div className="flex justify-center mb-3">
                        <button
                            onClick={handleCancel}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-destructive/10 text-destructive rounded-full hover:bg-destructive/20 transition-colors"
                        >
                            <X className="w-3 h-3" />
                            Cancel Task
                        </button>
                    </div>
                )}
                <form onSubmit={handleSubmit} className="relative group">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Send a task to CloudPilot A2A agent..."
                        className="w-full bg-card border border-border rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
                        disabled={isStreaming}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isStreaming}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 text-white opacity-0 group-focus-within:opacity-100 transition-all disabled:opacity-50"
                    >
                        {isStreaming ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
