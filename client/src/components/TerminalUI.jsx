import { useEffect, useState, useRef } from 'react';
import { socket } from '../socket';

export default function TerminalUI({ username, room }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState(new Set()); // CORRECTED LINE HERE
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Prevent multiple connections
    if (socket.connected) {
      socket.disconnect();
    }

    socket.connect();

    // Connection handlers
    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("joinRoom", { room, username });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    // Message handlers
    socket.on("message", (msg) => {
      setMessages((prev) => [...prev, {
        ...msg,
        timestamp: new Date().toLocaleTimeString()
      }]);
    });

    socket.on("userCount", (count) => {
      setUserCount(count);
    });

    socket.on("userTyping", ({ user, isTyping }) => {
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        if (isTyping) {
          newSet.add(user);
        } else {
          newSet.delete(user);
        }
        return newSet;
      });
    });

    // Cleanup function
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("message");
      socket.off("userCount");
      socket.off("userTyping");
      socket.disconnect();
    };
  }, [room, username]);

  // Helper function to decode HTML entities for display within code blocks
  const decodeHtmlEntities = (text) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  // Function to copy code to clipboard
  const copyToClipboard = async (text, elementId) => {
    try {
      const decodedTextForCopy = decodeHtmlEntities(text);
      await navigator.clipboard.writeText(decodedTextForCopy);
      const copyButton = document.getElementById(`copy-btn-${elementId}`);
      if (copyButton) {
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
          copyButton.textContent = 'Copy';
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy: ', err);
      const copyButton = document.getElementById(`copy-btn-${elementId}`);
      if (copyButton) {
        copyButton.textContent = 'Failed!';
        setTimeout(() => {
          copyButton.textContent = 'Copy';
        }, 2000);
      }
    }
  };

  // Function to format message content for display, including code blocks
  const formatMessageContent = (msg, idx) => {
    const text = msg.text;

    if (text.startsWith('```') && text.endsWith('```')) {
      const codeContent = text.substring(3, text.length - 3);

      const escapedAndThenDecodedCodeContent = decodeHtmlEntities(
        codeContent
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;")
      );

      return (
        <div className="relative bg-gray-800 p-2 rounded text-white overflow-x-hidden my-1 w-full min-w-0">
          <button
            id={`copy-btn-${idx}`}
            onClick={() => copyToClipboard(codeContent, idx)}
            className="absolute top-1 right-2 bg-green-700 text-white text-xs px-2 py-1 rounded hover:bg-green-600 transition-colors z-10"
          >
            Copy
          </button>
          <pre className="whitespace-pre-wrap break-all mt-6 text-sm">
            <code>{escapedAndThenDecodedCodeContent}</code>
          </pre>
        </div>
      );
    }

    const decodedNormalText = decodeHtmlEntities(text);

    if (decodedNormalText.includes('\n')) {
      const formattedTextWithBreaks = decodedNormalText.replace(/\n/g, '<br />');
      return <span className="break-all flex-1 min-w-0" dangerouslySetInnerHTML={{ __html: formattedTextWithBreaks }} />;
    } else {
      return <span className="break-all flex-1 min-w-0">{decodedNormalText}</span>;
    }
  };


  const handleSend = (e) => {
    e.preventDefault();
    const messageToSend = input.trim();

    if (messageToSend && isConnected) {
      socket.emit("sendMessage", messageToSend);
      setInput('');

      socket.emit("stopTyping");
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);

    if (isConnected) {
      socket.emit("startTyping");

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("stopTyping");
      }, 1000);
    }
  };

  return (
    <div className="bg-black text-green-500 font-mono h-screen p-4 flex flex-col overflow-hidden">
      {/* Header: fixed size, should not scroll with content */}
      <div className="border-b border-green-500 pb-2 mb-4 flex flex-col sm:flex-row justify-between items-center flex-shrink-0">
        <span className="text-lime-400 mb-2 sm:mb-0">Room: {room}</span>
        <div className="flex items-center space-x-4">
          <span className="text-sm">Users: {userCount}</span>
          <span className={`text-sm ${isConnected ? 'text-lime-400' : 'text-red-500'}`}>
            {isConnected ? '● Connected' : '● Disconnected'}
          </span>
        </div>
      </div>

      {/* Messages area: takes all available space, allows internal vertical scroll */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-1 pr-1">
        {messages.map((msg, idx) => (
          <div key={idx} className="flex flex-col sm:flex-row items-start min-w-0">
            <div className="flex-shrink-0 flex items-baseline w-full sm:w-auto mr-2">
              <span className="text-gray-400 text-xs mr-2">[{msg.timestamp}]</span>
              <span className={msg.user === 'System' ? 'text-yellow-400' : 'text-lime-400'}>
                {msg.user === 'System' ? '***' : `${msg.user}:`}
              </span>
            </div>
            {formatMessageContent(msg, idx)}
          </div>
        ))}

        {/* Typing indicator */}
        {typingUsers.size > 0 && (
          <div className="text-gray-400 text-sm italic">
            {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input (Footer): fixed size, should not scroll with content */}
      <form onSubmit={handleSend} className="flex flex-col sm:flex-row items-center flex-shrink-0">
        <span className="text-lime-400 mr-2 flex-shrink-0 mb-2 sm:mb-0">&gt;</span>
        <textarea
          className="bg-black border border-green-500 flex-grow px-2 py-1 outline-none text-green-500 resize-none w-full sm:w-auto min-w-0"
          value={input}
          onChange={handleInputChange}
          placeholder={isConnected ? "Type a message (Use ``` for code blocks)..." : "Connecting..."}
          disabled={!isConnected}
          autoFocus
          rows={3}
          maxLength={20000}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
        />
        <button
          type="submit"
          className="ml-0 sm:ml-2 mt-2 sm:mt-0 px-4 py-1 border border-green-500 hover:bg-green-500 hover:text-black transition-colors disabled:opacity-50 w-full sm:w-auto"
          disabled={!isConnected || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}