const { io } = require("socket.io-client");
const socket1 = io("http://localhost:3001");
const socket2 = io("http://localhost:3001");

let s1_state = "";
let s2_state = "";

socket1.on("connect", () => {
  console.log("S1 connect");
  socket1.emit("join_queue", "Player1");
});
socket2.on("connect", () => {
  console.log("S2 connect");
  socket2.emit("join_queue", "Player2");
});

socket1.on("queue_update", (data) => {
  console.log("S1 queue_update:", data);
  if(data.isHost && data.count >= 2) {
    console.log("Host (S1) emitting start_match");
    socket1.emit("start_match");
  }
});

socket1.on("game_start", (data) => {
  console.log("S1 game_start", data);
  process.exit(0);
});

setTimeout(() => {
  console.log("Timeout! No game_start received");
  process.exit(1);
}, 2000);
