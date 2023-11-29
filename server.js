const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

// Serve static files
app.use(express.static(__dirname + "/public"));

// Store connected users and their rooms
const users = {};

// Handle socket connections
io.on("connection", (socket) => {
  console.log("A user connected");

  // Handle drawing events

  socket.on("draw", (data) => {
    socket.broadcast.emit("draw", data);
  });

  // Handle joining a room
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    users[socket.id] = roomId;
    console.log(`User joined room: ${roomId}`);

    // Emit a 'user-connected' event to inform other users in the room
    socket.to(roomId).emit("user-connected", socket.id);
  });

  // Handle signaling events within a room
  socket.on("offer", (data) => {
    const roomId = users[socket.id];
    socket.to(roomId).emit("offer", data);
  });

  socket.on("answer", (data) => {
    const roomId = users[socket.id];
    socket.to(roomId).emit("answer", data);
  });

  socket.on("ice-candidate", (data) => {
    const roomId = users[socket.id];
    socket.to(roomId).emit("ice-candidate", data);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("A user disconnected");
    const roomId = users[socket.id];
    delete users[socket.id];
    socket.to(roomId).emit("user-disconnected", socket.id);
  });

  socket.on("clear-drawing", () => {
    const roomId = users[socket.id];
    io.to(roomId).emit("clear-drawing");
  });

  socket.on("undo-drawing", () => {
    const roomId = users[socket.id];
    io.to(roomId).emit("undo-drawing");
  });
});

// Start the server
const port = process.env.PORT || 3000;
http.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});