import { useEffect, useState, useRef, useCallback } from 'react';
import { socket } from '../socket';

export default function TerminalUI({ username, room }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [showCopyFeedback, setShowCopyFeedback] = useState({ visible: false, message: '', type: '' });
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const textareaRef = useRef(null);
  const isMobile = useRef(false);
  const messagesContainerRef = useRef(null);

  useEffect(() => {
    isMobile.current = /Mobi|Android/i.test(navigator.userAgent);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const isScrolledToBottom = useCallback(() => {
    if (!messagesContainerRef.current) return false;
    const { scrollHeight, scrollTop, clientHeight } = messagesContainerRef.current;
    return scrollHeight - scrollTop <= clientHeight + 20;
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const lineHeight = parseFloat(getComputedStyle(textareaRef.current).lineHeight);
      const maxHeight = lineHeight * 5;
      if (textareaRef.current.scrollHeight < maxHeight) {
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      } else {
        textareaRef.current.style.height = `${maxHeight}px`;
        textareaRef.current.style.overflowY = 'auto';
      }
    }
  }, [input]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isScrolledToBottom()) {
      scrollToBottom();
    }
  }, [typingUsers, scrollToBottom, isScrolledToBottom]);

  useEffect(() => {
    // Clear any existing localStorage for this room to prevent stale data
    localStorage.removeItem(`chat_history_${room}`);
    
    // Clear any existing connection
    if (socket.connected) {
      socket.disconnect();
    }

    // Start with empty messages - server will send history if room is active
    setMessages([]);

    socket.connect();

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("joinRoom", { room, username });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("message", (msg) => {
      setMessages((prev) => [...prev, {
        ...msg
      }]);
    });

    socket.on("userCount", (count) => {
      setUserCount(count);
    });

    socket.on("userTyping", ({ user, isTyping, uniqueId }) => {
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        const userIdentifier = uniqueId ? `${user}#${uniqueId}` : user;
        if (isTyping) {
          newSet.add(userIdentifier);
        } else {
          newSet.delete(userIdentifier);
        }
        return newSet;
      });
    });

    socket.on('error', (errorMessage) => {
      setMessages((prev) => [...prev, {
        user: 'System',
        text: `Error: ${errorMessage}`,
        timestamp: new Date().toLocaleTimeString(),
        color: '#FF0000'
      }]);
      console.error('Socket error:', errorMessage);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("message");
      socket.off("userCount");
      socket.off("userTyping");
      socket.off("error");
      socket.disconnect();
    };
  }, [room, username]);

  const decodeHtmlEntities = (text) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  const copyToClipboard = async (text, elementId) => {
    let success = false;
    let message = '';
    try {
      const decodedTextForCopy = decodeHtmlEntities(text);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(decodedTextForCopy);
        success = true;
        message = 'Copied!';
      } else {
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = decodedTextForCopy;
        tempTextArea.style.position = 'fixed';
        tempTextArea.style.left = '-9999px';
        document.body.appendChild(tempTextArea);
        tempTextArea.focus();
        tempTextArea.select();
        try {
          document.execCommand('copy');
          success = true;
          message = 'Copied!';
        } catch (err) {
          message = 'Failed to copy!';
          console.error('Fallback copy failed: ', err);
        } finally {
          document.body.removeChild(tempTextArea);
        }
      }
    } catch (err) {
      message = 'Failed to copy!';
      console.error('Failed to copy: ', err);
    } finally {
      setShowCopyFeedback({ visible: true, message, type: success ? 'success' : 'error' });
      setTimeout(() => setShowCopyFeedback({ visible: false, message: '', type: '' }), 2000);

      const copyButton = document.getElementById(`copy-btn-${elementId}`);
      if (copyButton) {
        copyButton.textContent = success ? 'Copied!' : 'Failed!';
        setTimeout(() => {
          copyButton.textContent = 'Copy';
        }, 2000);
      }
    }
  };

  const formatMessageContent = (msg, idx) => {
    const text = msg.text;

    if (text.startsWith('```') && text.endsWith('```')) {
      const codeContentEncoded = text.substring(3, text.length - 3);

      return (
        <div className="relative bg-gray-800 p-2 rounded text-white overflow-x-hidden my-1 w-full min-w-0">
          <button
            id={`copy-btn-${idx}`}
            onClick={() => copyToClipboard(codeContentEncoded, idx)}
            className="absolute top-1 right-2 bg-green-700 text-white text-xs px-2 py-1 rounded hover:bg-green-600 transition-colors z-10 min-w-[44px] min-h-[30px] flex items-center justify-center sm:min-h-[44px]"
          >
            Copy
          </button>
          <pre className="whitespace-pre-wrap break-all mt-6 text-sm">
            <code dangerouslySetInnerHTML={{ __html: codeContentEncoded }} />
          </pre>
        </div>
      );
    }

    const formattedTextWithBreaks = text.replace(/\n/g, '<br />');
    return <span className="break-all flex-1 min-w-0" dangerouslySetInnerHTML={{ __html: formattedTextWithBreaks }} />;
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
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);

    if (isConnected) {
      if (e.target.value.trim().length > 0) {
        socket.emit("startTyping");

        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
          socket.emit("stopTyping");
        }, 1000);
      } else {
        socket.emit("stopTyping");
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
      }
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (isMobile.current) {
        if (!e.shiftKey) {
          e.preventDefault();
        }
      } else {
        if (!e.shiftKey) {
          e.preventDefault();
          handleSend(e);
        }
      }
    }
  };

  const handleInputBlur = () => {
    scrollToBottom();
  };

  return (
    <div className="bg-black text-green-500 font-mono h-screen p-2 sm:p-4 flex flex-col overflow-hidden">
      <div className="border-b border-green-500 pb-2 mb-2 sm:mb-4 flex flex-col sm:flex-row justify-between items-center flex-shrink-0">
        <span className="text-lime-400 mb-1 sm:mb-0 text-sm sm:text-base">Room: {room}</span>
        <div className="flex items-center space-x-2 sm:space-x-4">
          <span className="text-xs sm:text-sm">Users: {userCount}</span>
          <span className={`text-xs sm:text-sm ${isConnected ? 'text-lime-400' : 'text-red-500'}`}>
            {isConnected ? '● Connected' : '● Disconnected'}
          </span>
        </div>
      </div>

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto mb-2 sm:mb-4 space-y-1 pr-1" onBlur={handleInputBlur}>
        {messages.map((msg, idx) => (
          <div key={idx} className="flex flex-col sm:flex-row items-start min-w-0">
            <div className="flex-shrink-0 flex items-baseline w-full sm:w-auto mr-1 sm:mr-2">
              <span className="text-gray-400 text-xs sm:text-sm mr-1 sm:mr-2">[{msg.timestamp}]</span>
              <span
                className={msg.user === 'System' ? 'text-yellow-400' : 'font-bold'}
                style={{ color: msg.color || (msg.user === 'System' ? '#FFFF00' : '#ADFF2F') }}
              >
                {msg.user === 'System' ? '***' : `${msg.user}${msg.uniqueId ? `#${msg.uniqueId}` : ''}:`}
              </span>
            </div>
            {formatMessageContent(msg, idx)}
          </div>
        ))}

        {typingUsers.size > 0 && (
          <div className="text-gray-400 text-xs sm:text-sm italic" aria-live="polite">
            {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {showCopyFeedback.visible && (
        <div
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 p-2 rounded text-white text-sm sm:text-base z-50
                      ${showCopyFeedback.type === 'success' ? 'bg-green-700' : 'bg-red-700'}`}
          aria-live="assertive"
        >
          {showCopyFeedback.message}
        </div>
      )}

      <form onSubmit={handleSend} className="flex flex-col sm:flex-row items-center flex-shrink-0">
        <span className="text-lime-400 mr-1 sm:mr-2 flex-shrink-0 mb-2 sm:mb-0 text-lg sm:text-base">&gt;</span>
        <textarea
          ref={textareaRef}
          className="bg-black border border-green-500 flex-grow px-2 py-1 outline-none text-green-500 resize-none w-full sm:w-auto min-w-0 text-sm sm:text-base"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          onBlur={handleInputBlur}
          placeholder={isConnected ? "Type a message (Use ``` for code blocks)..." : "Connecting..."}
          disabled={!isConnected}
          autoFocus
          rows={1}
          maxLength={20000}
        />
        <button
          type="submit"
          className="ml-0 sm:ml-2 mt-2 sm:mt-0 px-4 py-1 border border-green-500 hover:bg-green-500 hover:text-black transition-colors disabled:opacity-50 w-full sm:w-auto min-h-[44px] min-w-[44px] text-sm sm:text-base"
          disabled={!isConnected || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}