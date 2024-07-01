const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static(__dirname + "/public"));

const users = {};

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("draw", (data) => {
    socket.broadcast.emit("draw", data);
  });

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    users[socket.id] = roomId;
    console.log(`User joined room: ${roomId}`);

    socket.to(roomId).emit("user-connected", socket.id);
  });

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

const port = process.env.PORT || 3000;
http.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});