'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ChatMessage {
  id: number;
  sender: 'You' | 'Kerry Brothers Shop';
  text: string;
  timestamp: string;
}

const mockMessages: ChatMessage[] = [
  {
    id: 1,
    sender: 'Kerry Brothers Shop',
    text: "Hi! Unit 103 is in for its oil change. We noticed the left front tire is wearing unevenly — want us to rotate while it's here?",
    timestamp: 'Apr 8, 2026 · 9:14 AM',
  },
  {
    id: 2,
    sender: 'You',
    text: "Yes, please go ahead with the rotation. Does the tire need to be replaced soon?",
    timestamp: 'Apr 8, 2026 · 9:32 AM',
  },
  {
    id: 3,
    sender: 'Kerry Brothers Shop',
    text: "It's got about 40% tread left, so you've got some time. We'll keep an eye on it. Unit 103 should be ready by end of day.",
    timestamp: 'Apr 8, 2026 · 9:45 AM',
  },
  {
    id: 4,
    sender: 'You',
    text: "Perfect, thanks. Let me know when it's done.",
    timestamp: 'Apr 8, 2026 · 9:47 AM',
  },
];

export default function ChatPage() {
  const [inputValue, setInputValue] = useState('');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <div className="mx-auto px-4 py-8 max-w-3xl flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Chat with Shop</h1>
        <p className="text-sm text-muted-foreground">Communicate directly with Kerry Brothers.</p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        Messaging is coming soon &mdash; you&apos;ll be able to communicate directly with the shop from here.
      </div>

      <div className="flex flex-col rounded-lg border border-border bg-card overflow-hidden">
        {/* Message thread */}
        <div className="flex flex-col gap-4 p-4 min-h-[360px]">
          {mockMessages.map((msg) => {
            const isMe = msg.sender === 'You';
            return (
              <div key={msg.id} className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{msg.sender}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{msg.timestamp}</span>
                </div>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isMe
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-muted text-foreground rounded-tl-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3">
          <form onSubmit={handleSend} className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Message Kerry Brothers Shop..."
              className="flex-1"
              disabled
            />
            <Button type="submit" size="icon" disabled>
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Messaging not yet enabled
          </p>
        </div>
      </div>
    </div>
  );
}
