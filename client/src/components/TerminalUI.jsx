
import { useEffect, useState, useRef } from 'react';
import { socket } from '../socket';

export default function TerminalUI({ username, room }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState(new Set());
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

  const handleSend = (e) => {
    e.preventDefault();
    const sanitizedInput = input.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    if (sanitizedInput && isConnected) {
      socket.emit("sendMessage", sanitizedInput);
      setInput('');
      
      // Stop typing indicator
      socket.emit("stopTyping");
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    
    // Typing indicator
    if (isConnected) {
      socket.emit("startTyping");
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set new timeout to stop typing
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("stopTyping");
      }, 1000);
    }
  };

  return (
    <div className="bg-black text-green-500 font-mono h-screen p-4 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-green-500 pb-2 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-lime-400">Room: {room}</span>
          <div className="flex items-center space-x-4">
            <span className="text-sm">Users: {userCount}</span>
            <span className={`text-sm ${isConnected ? 'text-lime-400' : 'text-red-500'}`}>
              {isConnected ? '● Connected' : '● Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-1">
        {messages.map((msg, idx) => (
          <div key={idx} className="flex">
            <span className="text-gray-400 text-xs mr-2">[{msg.timestamp}]</span>
            <span className={msg.user === 'System' ? 'text-yellow-400' : 'text-lime-400'}>
              {msg.user === 'System' ? '***' : `${msg.user}:`}
            </span>
            <span className="ml-2" dangerouslySetInnerHTML={{ __html: msg.text }} />
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

      {/* Input */}
      <form onSubmit={handleSend} className="flex">
        <span className="text-lime-400 mr-2">&gt;</span>
        <input
          className="bg-black border border-green-500 flex-grow px-2 py-1 outline-none text-green-500"
          value={input}
          onChange={handleInputChange}
          placeholder={isConnected ? "Type a message..." : "Connecting..."}
          disabled={!isConnected}
          autoFocus
          maxLength={500}
        />
        <button 
          type="submit" 
          className="ml-2 px-4 py-1 border border-green-500 hover:bg-green-500 hover:text-black transition-colors disabled:opacity-50"
          disabled={!isConnected || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
