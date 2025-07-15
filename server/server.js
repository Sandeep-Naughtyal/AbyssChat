import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://abyss-chat.vercel.app",
    "https://abyss-chat.vercel.app/"  // Added trailing slash
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
const io = new Server(server, { 
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://abyss-chat.vercel.app",
      "https://abyss-chat.vercel.app/"  // Added trailing slash
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  connectionStateRecovery: {}
});

// Enhanced room management
const rooms = new Map();
const userRooms = new Map(); // Track which room each socket is in

// Helper functions
const sanitizeMessage = (msg) => {
  return msg.replace(/[<>]/g, '').substring(0, 500);
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
      
      // Add user to room
      const roomUsers = getRoomUsers(room);
      roomUsers.set(socket.id, { username, isTyping: false });
      userRooms.set(socket.id, room);
      
      // Notify others and update count
      socket.to(room).emit('message', { 
        user: 'System', 
        text: `${username} joined the room` 
      });
      
      updateUserCount(room);
      
      console.log(`${username} joined room ${room}`);
      
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
          text: sanitizedMsg 
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
      
      user.isTyping = true;
      socket.to(room).emit('userTyping', { user: user.username, isTyping: true });
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
      
      user.isTyping = false;
      socket.to(room).emit('userTyping', { user: user.username, isTyping: false });
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
            text: `${user.username} left the room` 
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