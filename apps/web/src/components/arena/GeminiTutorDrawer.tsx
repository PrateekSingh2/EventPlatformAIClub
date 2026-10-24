'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  Sparkles,
  Send,
  X,
  Key,
  Copy,
  Check,
  RotateCcw,
  AlertCircle,
  Loader2,
  FileText,
  Bot,
  User,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { ParsedFile } from '@/lib/types';

interface GeminiTutorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  promptFile: ParsedFile | null;
  stageNumber: number;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'gemini';
  text: string;
  timestamp: string;
}

/**
 * Signature Google Gemini multi-color sparkle icon
 */
export function GeminiSparkleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2C12 7.52285 7.52285 12 2 12C7.52285 12 12 16.4771 12 22C12 16.4771 16.4771 12 22 12C16.4771 12 12 7.52285 12 2Z"
        fill="url(#gemini_sparkle_grad)"
      />
      <defs>
        <linearGradient id="gemini_sparkle_grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4285F4" />
          <stop offset="0.4" stopColor="#9B72CF" />
          <stop offset="0.8" stopColor="#D96570" />
          <stop offset="1" stopColor="#F4B400" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function GeminiTutorDrawer({
  isOpen,
  onClose,
  promptFile,
  stageNumber,
}: GeminiTutorDrawerProps) {
  const [apiKey, setApiKey] = useState<string>('');
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [tempKeyInput, setTempKeyInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load API key from persistent storage on mount
  useEffect(() => {
    try {
      const stored =
        localStorage.getItem('contest_gemini_api_key') ||
        sessionStorage.getItem('contest_gemini_api_key') ||
        '';
      if (stored) {
        setApiKey(stored);
        setTempKeyInput(stored);
      }
    } catch {}
  }, [isOpen]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  if (!isOpen) return null;

  // Save new API Key
  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = tempKeyInput.trim();
    if (!cleanKey) {
      setError('Please provide a valid Gemini API Key from Google AI Studio.');
      return;
    }
    setApiKey(cleanKey);
    try {
      localStorage.setItem('contest_gemini_api_key', cleanKey);
      sessionStorage.setItem('contest_gemini_api_key', cleanKey);
    } catch {}
    setIsEditingKey(false);
    setError(null);
  };

  // Call Gemini REST API directly from client browser
  const executeGeminiCall = async (userPrompt: string, systemInstruction?: string) => {
    if (!apiKey) {
      setIsEditingKey(true);
      setError('Please enter your Google Gemini API key to proceed.');
      return;
    }

    setLoading(true);
    setError(null);

    const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Append user message to thread
    const userMsgId = Math.random().toString(36).substring(7);
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: userPrompt,
        timestamp: currentTime,
      },
    ]);

    try {
      const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash'];
      let responseText: string | null = null;
      let lastErrorMessage = '';

      const systemPrompt =
        systemInstruction ||
        `You are the official Gemini AI Tutor for the Pixel & Anomaly CTF contest (Stage ${stageNumber}).
Your role is to guide contestants through the challenge directives in their AI_TUTOR_PROMPT file.
- Explain algorithms, cryptographic principles, Python analysis scripts, and math steps clearly.
- Format all math equations using LaTeX syntax with $inline$ and $$block$$ notation.
- Format all code with clear Markdown fences (\`\`\`python ... \`\`\`).
- Guide contestants conceptually to understand the problem so they can extract the solution password flag themselves.`;

      for (const model of modelsToTry) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const payload = {
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `${systemPrompt}\n\nUser Question/Directive:\n${userPrompt}`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: 4096,
            },
          };

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.error?.message || `HTTP ${res.status} from model ${model}`);
          }

          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            responseText = rawText;
            break;
          }
        } catch (mErr: any) {
          lastErrorMessage = mErr.message || 'Model call failed';
          // If quota or invalid key, break early
          if (lastErrorMessage.includes('API_KEY_INVALID') || lastErrorMessage.includes('quota')) {
            break;
          }
        }
      }

      if (!responseText) {
        throw new Error(
          lastErrorMessage ||
            'Could not generate response from Gemini. Please verify your Google AI Studio API key.'
        );
      }

      const geminiMsgId = Math.random().toString(36).substring(7);
      setMessages((prev) => [
        ...prev,
        {
          id: geminiMsgId,
          sender: 'gemini',
          text: responseText!,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to communicate with Google Gemini API.');
    } finally {
      setLoading(false);
    }
  };

  // Handler for sending the prompt file
  const handleSendPromptFile = () => {
    if (!promptFile || !promptFile.content) {
      setError('No active prompt directive file loaded in the arena.');
      return;
    }

    const initialQuery = `Please analyze the directives and structure in "${promptFile.name}":\n\n\`\`\`text\n${promptFile.content}\n\`\`\`\n\nProvide an analysis with mathematical formulas (LaTeX), breakdown of required steps, and guidance to extract the target stage key.`;

    executeGeminiCall(
      initialQuery,
      `You are the official Gemini AI Tutor for Stage ${stageNumber}. The contestant just sent the ${promptFile.name} directive file. Break down the scenario, explain the math and logic using LaTeX and Markdown, and provide actionable tips.`
    );
  };

  // Handler for sending custom follow-up message
  const handleSendFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    const query = inputValue.trim();
    if (!query || loading) return;

    setInputValue('');
    executeGeminiCall(query);
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
      />

      {/* Side Tab Drawer */}
      <aside
        role="complementary"
        aria-label="Google Gemini AI Tutor"
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] md:w-[540px] bg-app-surface border-l border-app-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-250 select-none font-sans"
      >
        {/* Header Bar */}
        <div className="p-4 sm:p-4.5 border-b border-app-border flex items-center justify-between bg-app-surface/95 backdrop-blur-xl shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center shadow-xs">
              <GeminiSparkleIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-app-text tracking-tight flex items-center gap-1.5">
                  <span>Gemini AI Tutor</span>
                </h3>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  Google AI Studio
                </span>
              </div>
              <p className="text-[11px] text-app-subtext">Stage {stageNumber} Intelligent Contest Assistant</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* API Key Config Button */}
            <button
              onClick={() => setIsEditingKey(!isEditingKey)}
              className={`p-1.5 rounded-xl border transition-colors cursor-pointer text-xs flex items-center gap-1 min-h-[32px] ${
                apiKey
                  ? 'border-app-border bg-app-surface-raised text-app-subtext hover:text-app-text'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
              }`}
              title="Manage Google Gemini API Key"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="text-[10px] font-mono hidden sm:inline">
                {apiKey ? 'API Key Set' : 'Add API Key'}
              </span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-app-subtext hover:text-app-text hover:bg-app-hover border border-app-border transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
              aria-label="Close Gemini Tutor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* API Key Configuration Dropdown / Banner */}
        {isEditingKey && (
          <div className="p-4 bg-app-surface-raised border-b border-app-border space-y-3 animate-in fade-in duration-150 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-app-text flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-indigo-400" />
                <span>Google AI Studio API Key</span>
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1"
              >
                <span>Get Free Key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <form onSubmit={handleSaveApiKey} className="flex gap-2">
              <input
                type="password"
                value={tempKeyInput}
                onChange={(e) => setTempKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 px-3 py-1.5 text-xs text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-indigo-400 font-mono shadow-inner"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-xl bg-app-text text-app-bg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
              >
                Save Key
              </button>
            </form>
            <p className="text-[10px] text-app-subtext">
              Your key is stored purely on your local browser for zero latency and private LLM analysis.
            </p>
          </div>
        )}

        {/* Error Alert Banner */}
        {error && (
          <div className="p-3 bg-rose-500/10 border-b border-rose-500/20 text-rose-500 dark:text-rose-400 text-xs flex items-start gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Chat Feed / Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
          {messages.length === 0 ? (
            /* Prompt File Send Card (Initial State) */
            <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-5">
              <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center shadow-lg">
                <GeminiSparkleIcon className="w-8 h-8" />
              </div>

              <div className="space-y-1.5 max-w-sm">
                <h4 className="text-base font-bold text-app-text tracking-tight">
                  Consult the Gemini AI Tutor
                </h4>
                <p className="text-xs text-app-subtext leading-relaxed">
                  Send your active stage prompt directive to Gemini for automated conceptual breakdown, LaTeX formulas, and solving hints.
                </p>
              </div>

              {promptFile ? (
                <div className="w-full max-w-sm p-4 rounded-2xl bg-app-surface-raised border border-app-border text-left space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 min-w-0">
                      <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-bold text-xs text-app-text truncate">{promptFile.name}</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-app-muted text-app-subtext border border-app-border">
                      {(promptFile.content || '').split('\n').length} lines
                    </span>
                  </div>

                  <p className="text-[11px] text-app-subtext line-clamp-2 font-mono bg-app-bg p-2 rounded-xl border border-app-border">
                    {promptFile.content?.slice(0, 140)}...
                  </p>

                  {/* Chrome-Style Eye-Catching Action Button */}
                  <button
                    type="button"
                    onClick={handleSendPromptFile}
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white font-semibold text-xs active:scale-[0.98] transition-all cursor-pointer shadow-[0_2px_14px_rgba(79,70,229,0.35)] border border-white/20 flex items-center justify-center space-x-2 min-h-[42px]"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Analyzing with Gemini...</span>
                      </>
                    ) : (
                      <>
                        <GeminiSparkleIcon className="w-4 h-4" />
                        <span>Send {promptFile.name} to Gemini</span>
                        <ChevronRight className="w-3.5 h-3.5 ml-1" />
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-app-surface-raised border border-app-border text-xs text-app-subtext">
                  Please select or focus a stage prompt file (e.g. <code>AI_TUTOR_PROMPT.txt</code>) in the explorer.
                </div>
              )}
            </div>
          ) : (
            /* Multi-turn Chat Thread */
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col space-y-1.5 ${
                    msg.sender === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 text-[10px] font-mono text-app-subtext px-1">
                    {msg.sender === 'gemini' ? (
                      <>
                        <GeminiSparkleIcon className="w-3 h-3" />
                        <span className="font-bold text-indigo-400">Gemini</span>
                      </>
                    ) : (
                      <>
                        <User className="w-3 h-3" />
                        <span>You</span>
                      </>
                    )}
                    <span>&bull;</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div
                    className={`rounded-2xl p-4 max-w-[95%] text-xs sm:text-[13px] leading-relaxed shadow-xs relative group ${
                      msg.sender === 'user'
                        ? 'bg-app-text text-app-bg font-medium'
                        : 'bg-app-surface-raised border border-app-border text-app-text'
                    }`}
                  >
                    {msg.sender === 'gemini' ? (
                      <div className="prose prose-invert prose-headings:text-app-text prose-p:text-app-text prose-code:text-indigo-400 prose-code:bg-app-bg prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px] prose-pre:bg-app-bg prose-pre:border prose-pre:border-app-border prose-pre:rounded-xl prose-pre:p-3 max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.text}</div>
                    )}

                    {/* Copy Button */}
                    <button
                      onClick={() => handleCopyText(msg.text, msg.id)}
                      className="absolute right-2 top-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-app-hover text-app-subtext hover:text-app-text transition-opacity cursor-pointer"
                      title="Copy response"
                    >
                      {copiedId === msg.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex items-center space-x-2 p-3 rounded-2xl bg-app-surface-raised border border-app-border text-xs text-app-subtext animate-pulse">
                  <GeminiSparkleIcon className="w-4 h-4 animate-spin" />
                  <span>Gemini is generating solution guidance with LaTeX & Markdown...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Bottom Input Bar for Follow-up Questions */}
        <div className="p-3.5 border-t border-app-border bg-app-surface shrink-0 space-y-2">
          {promptFile && messages.length > 0 && (
            <div className="flex items-center justify-between text-[10px] text-app-subtext px-1">
              <span className="truncate">Active Context: {promptFile.name}</span>
              <button
                type="button"
                onClick={() => setMessages([])}
                className="hover:text-app-text flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Chat</span>
              </button>
            </div>
          )}

          <form onSubmit={handleSendFollowUp} className="flex items-center space-x-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask Gemini follow-up question or request Python snippet..."
              disabled={loading || !apiKey}
              className="flex-1 px-3.5 py-2.5 text-xs text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-indigo-400 transition-colors shadow-inner min-h-[42px] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !inputValue.trim() || !apiKey}
              className="p-2.5 rounded-xl bg-app-text text-app-bg hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer min-h-[42px] min-w-[42px] flex items-center justify-center shrink-0"
              title="Send message to Gemini"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
