import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
dotenv.config();

const app = express();

// CORS configuration for Express
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",      // Common Vite port
    "http://localhost:5174",      // Alternative Vite port
    "https://abyss-chat.vercel.app",
    "https://abyss-chat.vercel.app/"
  ],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

const server = http.createServer(app);

// Socket.io configuration with CORS
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173",      // Common Vite port
      "http://localhost:5174",      // Alternative Vite port
      "https://abyss-chat.vercel.app",
      "https://abyss-chat.vercel.app/"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  connectionStateRecovery: {} // Enables connection state recovery
});

// Enhanced room management
const rooms = new Map();
const userRooms = new Map(); // Track which room each socket is in

// Color palette for users (ensure good contrast) 
const userColors = [
  '#FF5733', // Red-orange
  '#33FF57', // Bright Green
  '#3357FF', // Bright Blue
  '#FF33EE', // Pink-purple
  '#FFBD33', // Orange
  '#33FFEE', // Cyan
  '#EE33FF', // Magenta
  '#80FF33', // Lime Green
  '#3380FF', // Sky Blue
  '#FF3380'  // Rose
];

// Helper function to generate a short unique ID
const generateUniqueId = () => Math.random().toString(36).substring(2, 6);

// Helper function to sanitize messages (CRITICAL XSS FIX)
const sanitizeMessage = (msg) => {
  let cleanedMsg = msg.trim();

  if (!cleanedMsg) {
    return '';
  }

  const MAX_MESSAGE_LENGTH = 20000;
  if (cleanedMsg.length > MAX_MESSAGE_LENGTH) {
    cleanedMsg = cleanedMsg.substring(0, MAX_MESSAGE_LENGTH);
  }

  //CRITICAL: ALWAYS replace HTML special characters to prevent XSS 
  cleanedMsg = cleanedMsg
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // It specifically targets common script injection vectors if somehow the entity encoding fails or is bypassed.
  if (cleanedMsg.startsWith('&amp;&amp;&amp;') && cleanedMsg.endsWith('&amp;&amp;&amp;')) { // Check for encoded backticks
    cleanedMsg = cleanedMsg.replace(/&lt;s(?:cript|tyle).*?&gt;.*?&lt;\/(?:script|style).*?&gt;/gim, '') // Remove script/style tags (encoded)
                     .replace(/&lt;img.*?&gt;/gim, '') // Remove image tags (encoded)
                     .replace(/&lt;iframe.*?&gt;.*?&lt;\/iframe.*?&gt;/gim, ''); // Remove iframe tags (encoded)
  }

  return cleanedMsg;
};


const getRoomUsers = (room) => {
  return rooms.get(room) || new Map();
};

const updateUserCount = (room) => {
  const users = getRoomUsers(room);
  io.to(room).emit('userCount', users.size);
};

const cleanupRoom = (room) => {
  const users = getRoomUsers(room);
  if (users.size === 0) {
    rooms.delete(room);
    console.log(`Room ${room} deleted - no users remaining`);
  }
};

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('joinRoom', ({ room, username }) => {
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

      // Join new room
      socket.join(room);

      // Initialize room if it doesn't exist
      if (!rooms.has(room)) {
        rooms.set(room, new Map());
      }

      // Add user to room with color and unique ID
      const roomUsers = getRoomUsers(room);
      const userColor = userColors[Math.floor(Math.random() * userColors.length)]; // Random color
      const uniqueId = generateUniqueId(); // Generate unique ID
      roomUsers.set(socket.id, { username, color: userColor, uniqueId, isTyping: false });
      userRooms.set(socket.id, room);

      // Notify others and update count
      socket.to(room).emit('message', {
        user: 'System',
        text: sanitizeMessage(`${username} joined the room`), // Sanitize system messages too
        timestamp: new Date().toLocaleTimeString() // Add timestamp for consistency
      });

      updateUserCount(room);

      console.log(`${username} (ID: ${uniqueId}) joined room ${room} with color ${userColor}`);

    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', 'Failed to join room');
    }
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
          color: user.color, // Include user color
          uniqueId: user.uniqueId, // Include unique ID
          timestamp: new Date().toLocaleTimeString() // Add timestamp
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  socket.on('startTyping', () => {
    try {
      const room = userRooms.get(socket.id);
      if (!room) return;

      const roomUsers = getRoomUsers(room);
      const user = roomUsers.get(socket.id);
      if (!user) return;

      if (!user.isTyping) { // Prevent redundant emits
        user.isTyping = true;
        socket.to(room).emit('userTyping', { user: user.username, isTyping: true, uniqueId: user.uniqueId });
      }
    } catch (error) {
      console.error('Error handling typing:', error);
    }
  });

  socket.on('stopTyping', () => {
    try {
      const room = userRooms.get(socket.id);
      if (!room) return;

      const roomUsers = getRoomUsers(room);
      const user = roomUsers.get(socket.id);
      if (!user) return;

      if (user.isTyping) { // Prevent redundant emits
        user.isTyping = false;
        socket.to(room).emit('userTyping', { user: user.username, isTyping: false, uniqueId: user.uniqueId });
      }
    } catch (error) {
      console.error('Error handling stop typing:', error);
    }
  });

  socket.on('disconnect', () => {
    try {
      const room = userRooms.get(socket.id);
      if (room) {
        const roomUsers = getRoomUsers(room);
        const user = roomUsers.get(socket.id);

        if (user) {
          // Notify others
          socket.to(room).emit('message', {
            user: 'System',
            text: sanitizeMessage(`${user.username} left the room`), // Sanitize system message
            timestamp: new Date().toLocaleTimeString() // Add timestamp
          });

          // Remove user from room
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