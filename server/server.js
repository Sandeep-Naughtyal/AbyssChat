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

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 100;
const MAX_MESSAGE_LENGTH = 20000;
const MAX_ROOM_MESSAGES = 50; // Keep last 50 messages per room

// CORS configuration
const corsOptions = {
  origin: ALLOWED_ORIGINS,
  credentials: true
};

app.use(cors(corsOptions));

const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS
});

app.use(limiter);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    ...corsOptions,
    methods: ["GET", "POST"]
  },
  connectionStateRecovery: {}
});

// Room management - now includes message history
const rooms = new Map(); // { roomId: { users: Map, messages: Array } }
const userRooms = new Map();

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

const getRoomData = (room) => {
  if (!rooms.has(room)) {
    rooms.set(room, { users: new Map(), messages: [] });
  }
  return rooms.get(room);
};

const getRoomUsers = (room) => getRoomData(room).users;
const getRoomMessages = (room) => getRoomData(room).messages;

const addMessageToRoom = (room, message) => {
  const roomData = getRoomData(room);
  roomData.messages.push(message);
  
  // Keep only the last MAX_ROOM_MESSAGES
  if (roomData.messages.length > MAX_ROOM_MESSAGES) {
    roomData.messages = roomData.messages.slice(-MAX_ROOM_MESSAGES);
  }
};

const updateUserCount = (room) => {
  const users = getRoomUsers(room);
  io.to(room).emit('userCount', users.size);
};

const cleanupRoom = (room) => {
  const roomData = getRoomData(room);
  if (roomData.users.size === 0) {
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

        // Send recent message history to the new user
        const recentMessages = getRoomMessages(room);
        if (recentMessages.length > 0) {
          // Send last 20 messages to new user
          const messagesToSend = recentMessages.slice(-20);
          messagesToSend.forEach(msg => {
            socket.emit('message', msg);
          });
        }

        // Notify others about new user
        const joinMessage = {
          user: 'System',
          text: sanitizeMessage(`${username} joined the room`),
          timestamp: new Date().toLocaleTimeString()
        };

        socket.to(room).emit('message', joinMessage);
        addMessageToRoom(room, joinMessage);

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
        const message = {
          user: user.username,
          text: sanitizedMsg,
          color: user.color,
          uniqueId: user.uniqueId,
          timestamp: new Date().toLocaleTimeString()
        };

        io.to(room).emit('message', message);
        addMessageToRoom(room, message); // Store message in room history
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
          const leaveMessage = {
            user: 'System',
            text: sanitizeMessage(`${user.username} left the room`),
            timestamp: new Date().toLocaleTimeString()
          };

          socket.to(room).emit('message', leaveMessage);
          addMessageToRoom(room, leaveMessage);

          roomUsers.delete(socket.id);
          updateUserCount(room);
          cleanupRoom(room); // This will delete room AND messages when empty
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