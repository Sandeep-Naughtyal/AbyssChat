import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Constants
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://localhost:5174",
  "https://abyss-chat.vercel.app"
];

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 100;
const MAX_MESSAGE_LENGTH = 20000;

// CORS configuration
const corsOptions = {
  origin: ALLOWED_ORIGINS,
  credentials: true
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS
});

app.use(limiter);

// Create HTTP server
const server = http.createServer(app);

// Socket.io configuration
const io = new Server(server, {
  cors: {
    ...corsOptions,
    methods: ["GET", "POST"]
  },
  connectionStateRecovery: {}
});

// Room management
const rooms = new Map();
const userRooms = new Map();

// Color palette for users
const userColors = [
  '#FF5733', '#33FF57', '#3357FF', '#FF33EE', '#FFBD33',
  '#33FFEE', '#EE33FF', '#80FF33', '#3380FF', '#FF3380'
];

// Helper functions
const generateUniqueId = () => Math.random().toString(36).substring(2, 6);

const sanitizeMessage = (msg) => {
  let cleanedMsg = msg.trim();

  if (!cleanedMsg) return '';

  if (cleanedMsg.length > MAX_MESSAGE_LENGTH) {
    cleanedMsg = cleanedMsg.substring(0, MAX_MESSAGE_LENGTH);
  }

  // Replace HTML special characters
  cleanedMsg = cleanedMsg
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  if (cleanedMsg.startsWith('&amp;&amp;&amp;') && cleanedMsg.endsWith('&amp;&amp;&amp;')) {
    cleanedMsg = cleanedMsg
      .replace(/&lt;s(?:cript|tyle).*?&gt;.*?&lt;\/(?:script|style).*?&gt;/gim, '')
      .replace(/&lt;img.*?&gt;/gim, '')
      .replace(/&lt;iframe.*?&gt;.*?&lt;\/iframe.*?&gt;/gim, '');
  }

  return cleanedMsg;
};

const getRoomUsers = (room) => rooms.get(room) || new Map();

const updateUserCount = (room) => {
  const users = getRoomUsers(room);
  io.to(room).emit('userCount', users.size);
};

const cleanupRoom = (room) => {
  if (getRoomUsers(room).size === 0) {
    rooms.delete(room);
    console.log(`Room ${room} deleted - no users remaining`);
  }
};

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  const handleRoomOperations = (room, username, action) => {
    try {
      // Leave previous room if any
      const previousRoom = userRooms.get(socket.id);
      if (previousRoom) {
        socket.leave(previousRoom);
        const prevUsers = getRoomUsers(previousRoom);
        prevUsers.delete(socket.id);
        updateUserCount(previousRoom);
        cleanupRoom(previousRoom);
      }

      if (action === 'join') {
        socket.join(room);

        if (!rooms.has(room)) {
          rooms.set(room, new Map());
        }

        const roomUsers = getRoomUsers(room);
        const userColor = userColors[Math.floor(Math.random() * userColors.length)];
        const uniqueId = generateUniqueId();

        roomUsers.set(socket.id, {
          username,
          color: userColor,
          uniqueId,
          isTyping: false
        });

        userRooms.set(socket.id, room);

        socket.to(room).emit('message', {
          user: 'System',
          text: sanitizeMessage(`${username} joined the room`),
          timestamp: new Date().toLocaleTimeString()
        });

        updateUserCount(room);
        console.log(`${username} (ID: ${uniqueId}) joined room ${room} with color ${userColor}`);
      }
    } catch (error) {
      console.error(`Error during ${action} room operation:`, error);
      socket.emit('error', `Failed to ${action} room`);
    }
  };

  socket.on('joinRoom', ({ room, username }) => {
    handleRoomOperations(room, username, 'join');
  });

  socket.on('sendMessage', (msg) => {
    try {
      const room = userRooms.get(socket.id);
      if (!room) return;

      const roomUsers = getRoomUsers(room);
      const user = roomUsers.get(socket.id);
      if (!user) return;

      const sanitizedMsg = sanitizeMessage(msg);
      if (sanitizedMsg.trim()) {
        io.to(room).emit('message', {
          user: user.username,
          text: sanitizedMsg,
          color: user.color,
          uniqueId: user.uniqueId,
          timestamp: new Date().toLocaleTimeString()
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  const handleTyping = (typingState) => {
    try {
      const room = userRooms.get(socket.id);
      if (!room) return;

      const roomUsers = getRoomUsers(room);
      const user = roomUsers.get(socket.id);
      if (!user || user.isTyping === typingState) return;

      user.isTyping = typingState;
      socket.to(room).emit('userTyping', {
        user: user.username,
        isTyping: typingState,
        uniqueId: user.uniqueId
      });
    } catch (error) {
      console.error(`Error handling ${typingState ? 'start' : 'stop'} typing:`, error);
    }
  };

  socket.on('startTyping', () => handleTyping(true));
  socket.on('stopTyping', () => handleTyping(false));

  socket.on('disconnect', () => {
    try {
      const room = userRooms.get(socket.id);
      if (room) {
        const roomUsers = getRoomUsers(room);
        const user = roomUsers.get(socket.id);

        if (user) {
          socket.to(room).emit('message', {
            user: 'System',
            text: sanitizeMessage(`${user.username} left the room`),
            timestamp: new Date().toLocaleTimeString()
          });

          roomUsers.delete(socket.id);
          updateUserCount(room);
          cleanupRoom(room);
        }

        userRooms.delete(socket.id);
      }

      console.log(`User disconnected: ${socket.id}`);
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`);
});