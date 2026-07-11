import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Send, Trash2, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  useDeleteOpenaiConversation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface PortfolioChatProps {
  title?: string;
  subtitle?: string;
  conversationTitle?: string;
  suggestedQuestions?: string[];
}

export function PortfolioChat({
  title = "Portfolio AI Assistant",
  subtitle = "Ask anything about your properties",
  conversationTitle = "Portfolio Assistant",
  suggestedQuestions,
}: PortfolioChatProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const { data: convList } = useListOpenaiConversations();
  const createConversation = useCreateOpenaiConversation();
  const deleteConversationMutation = useDeleteOpenaiConversation();

  // Auto-scroll to latest message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [localMessages, isOpen]);

  // On open, load the existing portfolio conversation if any
  useEffect(() => {
    if (isOpen && convList && !conversationId) {
      const existing = convList.find((c) => c.title === conversationTitle);
      if (existing) {
        setConversationId(existing.id);
        // Load messages from server
        fetch(`/api/openai/conversations/${existing.id}/messages`)
          .then((r) => r.json())
          .then((msgs: { role: string; content: string }[]) => {
            setLocalMessages(
              msgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
            );
          })
          .catch(() => {});
      }
    }
  }, [isOpen, convList, conversationId]);

  const ensureConversation = useCallback(async (): Promise<number> => {
    if (conversationId) return conversationId;
    const conv = await createConversation.mutateAsync({
      data: { title: conversationTitle },
    });
    setConversationId(conv.id);
    queryClient.invalidateQueries({ queryKey: ["/api/openai/conversations"] });
    return conv.id;
  }, [conversationId, createConversation, queryClient]);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || isStreaming) return;

    setInput("");
    setError(null);
    setLocalMessages((prev) => [...prev, { role: "user", content }]);
    setIsStreaming(true);

    // Placeholder for streaming assistant message
    setLocalMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", streaming: true },
    ]);

    try {
      const id = await ensureConversation();

      const response = await fetch(`/api/openai/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          const event = JSON.parse(json);
          if (event.done) {
            setLocalMessages((prev) =>
              prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, streaming: false } : m
              )
            );
          } else if (event.content) {
            setLocalMessages((prev) =>
              prev.map((m, i) =>
                i === prev.length - 1
                  ? { ...m, content: m.content + event.content }
                  : m
              )
            );
          }
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLocalMessages((prev) => prev.slice(0, -1)); // remove placeholder
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, ensureConversation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = async () => {
    if (!conversationId) return;
    await deleteConversationMutation.mutateAsync({ id: conversationId });
    setConversationId(null);
    setLocalMessages([]);
    queryClient.invalidateQueries({ queryKey: ["/api/openai/conversations"] });
  };

  const defaultSuggestions = [
    "Which property has the most equity?",
    "What's my total monthly obligation?",
    "Which loan has the highest interest rate?",
    "How much have I gained across all properties?",
  ];
  const resolvedSuggestions = suggestedQuestions ?? defaultSuggestions;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header – always visible */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {localMessages.length > 0 && !isOpen && (
            <span className="text-xs text-muted-foreground">
              {localMessages.length} message{localMessages.length !== 1 ? "s" : ""}
            </span>
          )}
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="border-t border-border flex flex-col" style={{ height: "420px" }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
            {localMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-4">
                <Bot className="w-10 h-10 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium text-foreground">Ask about your portfolio</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    I know all your property details, loan terms, balances, and equity.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {resolvedSuggestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setInput(q);
                        textareaRef.current?.focus();
                      }}
                      className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {localMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-2 max-w-[85%]",
                      msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted text-foreground rounded-tl-sm"
                      )}
                    >
                      {msg.content}
                      {msg.streaming && !msg.content && (
                        <span className="inline-flex gap-1 items-center h-4">
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              <X className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Input */}
          <div className="px-4 pb-4 pt-2 border-t border-border flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your portfolio…"
              className="resize-none min-h-[40px] max-h-[120px] text-sm py-2.5"
              rows={1}
              disabled={isStreaming}
            />
            <div className="flex flex-col gap-1.5">
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!input.trim() || isStreaming}
                className="h-9 w-9 flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
              {localMessages.length > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={clearChat}
                  disabled={isStreaming}
                  className="h-9 w-9 flex-shrink-0 text-muted-foreground hover:text-destructive"
                  title="Clear chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
