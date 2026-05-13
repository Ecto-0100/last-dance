const { io } = require("socket.io-client");
const socket1 = io("http://localhost:3001");
const socket2 = io("http://localhost:3001");

socket1.on("connect", () => {
  socket1.emit("join_queue", "Player1");
});

socket2.on("connect", () => {
  socket2.emit("join_queue", "Player2");
});

socket1.on("queue_update", (data) => {
  console.log("S1 queue_update:", data);
  if(data.isHost && data.count >= 2) {
    console.log("S1 isHost and count >= 2. emitting start_match.");
    socket1.emit("start_match");
  }
});

socket1.on("game_start", (data) => {
  console.log("S1 game_start received");
  process.exit(0);
});

setTimeout(() => {
  console.log("Timeout!");
  process.exit(1);
}, 3000);
