const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const {
  CARD_TYPES,
  EFFECT_SUBTYPES,
  generateDeck,
  getEventCardPool,
  mergeCards,
  resolveDuel
} = require('./gameLogic');

const app = express();
app.use(cors());

// 프로덕션: 빌드된 클라이언트 정적 파일 서빙
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuildPath));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3001;

const rooms = {};
const socketToRoom = {};
const socketToPlayer = {}; // Map socket.id -> persistent playerId
const playerToSocket = {}; // Map playerId -> latest socket.id

/**
 * Helper to generate random Room ID
 */
function generateRoomId() {
  let id;
  do {
    id = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms[id]);
  return id;
}

const updateAllPlayers = (room) => {
  if (!room || !room.players) return;
  Object.keys(room.players).forEach(pId => {
    const sId = playerToSocket[pId];
    if (sId) {
      io.to(sId).emit('update_state', { gameState: getSanitizedState(room, pId) });
    }
  });
};

const getSanitizedState = (room, forPlayerId) => {
  const sanitized = JSON.parse(JSON.stringify(room));
  if (!sanitized.slots) return sanitized;

  const revealAtk = room.revealState === 'attacker' || room.revealState === 'both';
  const revealDef = room.revealState === 'both' || sanitized.slots.gaveUp;

  // Mask Opponent Cards in slots if not in reveal phase
  if (sanitized.slots.atk && sanitized.slots.atk.ownerId !== forPlayerId && !revealAtk) {
    sanitized.slots.atk.card = {
      ...sanitized.slots.atk.card,
      name: '???',
      value: '?',
      isMasked: true
    };
  }
  if (sanitized.slots.def && sanitized.slots.def.ownerId !== forPlayerId && !revealDef) {
    sanitized.slots.def.card = {
      ...sanitized.slots.def.card,
      name: '???',
      value: '?',
      isMasked: true
    };
  }
  return sanitized;
};

// Central helper for Match End
function checkMatchEnded(room) {
  const alivePlayers = Object.values(room.players).filter(p => p.hp > 0);
  if (alivePlayers.length <= 1) {
    if (alivePlayers.length === 1) {
      const winner = alivePlayers[0];
      room.logs.push(`${winner.name} wins the match!`);
      room.phase = 'victory';
      room.winnerId = winner.id;
    } else {
      room.logs.push('All players have fallen. Draw!');
      room.phase = 'victory';
      room.winnerId = null;
    }
    io.to(String(room.id)).emit('game_over', { gameState: room });
    return true;
  }
  return false;
}

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // 1. Create Room
  socket.on('create_room', ({ name, maxPlayers, playerId }) => {
    const roomId = generateRoomId();
    socket.join(roomId);
    socketToRoom[socket.id] = roomId;
    socketToPlayer[socket.id] = playerId;
    playerToSocket[playerId] = socket.id;

    const player = {
      id: playerId,
      name: name || 'Anonymous',
      heroClass: 'warrior',
      hp: 100,
      wins: 0,
      mergesAchieved: 0,
      ready: true, // Host is always ready initially
      hand: [],
      points: 0,
      statusEffects: [],
      isEvading: false,
      isStunned: false,
      currentBuffs: { atk: 0, def: 0 }
    };

    rooms[roomId] = {
      id: roomId,
      hostId: playerId,
      players: { [playerId]: player },
      turnOrder: [playerId],
      maxPlayers: maxPlayers || 4,
      roundCount: 0,
      deck: [],
      slots: { atk: null, def: null, effect: [], gaveUp: false },
      readyForCombat: [],
      turnStats: { effectUsed: false, mergeUsedBy: {} },
      lastActivity: Date.now(),
      defenderPhaseStart: null,
      logs: [`Battle room created by ${player.name}.`],
      fieldEvent: null,
      currentTarget: null,
      phase: 'waiting'
    };

    socket.emit('room_joined', { roomId, gameState: getSanitizedState(rooms[roomId], playerId) });
  });

  // 2. Join Room
  socket.on('join_room', ({ roomId, name, playerId }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error_msg', 'Room not found.');
    if (Object.keys(room.players).length >= room.maxPlayers && !room.players[playerId]) {
      return socket.emit('error_msg', 'Room is full.');
    }

    socket.join(roomId);
    socketToRoom[socket.id] = roomId;
    socketToPlayer[socket.id] = playerId;
    playerToSocket[playerId] = socket.id;

    // Handle Join / Re-connect
    if (room.players[playerId]) {
      room.logs.push(`${room.players[playerId].name} reconnected.`);
    } else {
      const player = {
        id: playerId,
        name: name || 'Anonymous',
        heroClass: 'warrior',
        hp: 100,
        wins: 0,
        mergesAchieved: 0,
        ready: false,
        hand: [],
        points: 0,
        statusEffects: [],
        isEvading: false,
        isStunned: false,
        currentBuffs: { atk: 0, def: 0 }
      };
      room.players[playerId] = player;
      room.turnOrder.push(playerId);
      room.logs.push(`${player.name} joined.`);
    }

    updateAllPlayers(room);
    socket.emit('room_joined', { roomId, gameState: getSanitizedState(room, playerId) });
  });

  socket.on('set_ready', (ready) => {
    const rId = socketToRoom[socket.id];
    const room = rooms[rId];
    if (!room) return;
    const pId = socketToPlayer[socket.id];

    // Host is always ready, cannot toggle
    if (room.hostId === pId) return;

    if (room.players[pId]) {
      room.players[pId].ready = ready;
      updateAllPlayers(room);
    }
  });

  socket.on('select_class', (heroId) => {
    const rId = socketToRoom[socket.id];
    const room = rooms[rId];
    if (!room) return;
    const pId = socketToPlayer[socket.id];
    // Class change allowed if NOT ready OR if the player is the host
    if (room.players[pId] && (!room.players[pId].ready || room.hostId === pId)) {
      room.players[pId].heroClass = heroId;
      updateAllPlayers(room);
    }
  });

  socket.on('start_match', () => {
    const rId = socketToRoom[socket.id];
    const room = rooms[rId];
    const pId = socketToPlayer[socket.id];
    if (room && room.hostId === pId) {
      startNewRound(room);
    }
  });

  socket.on('kick_player', ({ targetId }) => {
    const rId = socketToRoom[socket.id];
    const room = rooms[rId];
    const pId = socketToPlayer[socket.id];
    if (room && room.hostId === pId && targetId !== pId) {
      const targetSocketId = playerToSocket[targetId];
      if (targetSocketId) {
        io.sockets.sockets.get(targetSocketId)?.leave(rId);
        delete socketToRoom[targetSocketId];
      }
      delete room.players[targetId];
      room.turnOrder = room.turnOrder.filter(id => id !== targetId);
      updateAllPlayers(room);
    }
  });

  // 6. Game Actions
  socket.on('select_target', ({ targetId, roomId }) => {
    const rId = roomId || socketToRoom[socket.id];
    const room = rooms[rId];
    if (!room || room.phase !== 'battle' || room.isResolving) return;

    const pId = socketToPlayer[socket.id];
    const currentAttacker = room.turnOrder[room.activeIdx];
    console.log(`[Target] Request from ${pId}. Active: ${currentAttacker}. Target: ${targetId}`);

    if (currentAttacker === pId && room.players[targetId] && targetId !== pId) {
      room.currentTarget = targetId;
      room.lastActivity = Date.now();
      console.log(`   - SUCCESS: Target locked to ${targetId}`);
      room.turnStats = { effectUsed: false, mergeUsedBy: {} };
      updateAllPlayers(room);
    } else {
      console.log(`   - FAILED: Turn mismatch or invalid target.`);
    }
  });

  socket.on('forfeit_attack', ({ roomId }) => {
    const rId = roomId || socketToRoom[socket.id];
    const room = rooms[rId];
    if (!room || room.phase !== 'battle' || room.isResolving) return;

    const pId = socketToPlayer[socket.id];
    if (room.turnOrder[room.activeIdx] === pId) {
      room.logs.push(`${room.players[pId].name}이(가) 턴을 포기했습니다.`);
      room.slots = { atk: null, def: null, effect: [], gaveUp: false };
      room.readyForCombat = [];
      room.currentTarget = null;
      advanceTurn(room);
    }
  });
  socket.on('submit_card', ({ cardId, type, roomId }) => {
    const rId = roomId || socketToRoom[socket.id];
    const room = rooms[rId];
    if (!room || room.isResolving) return;

    const pId = socketToPlayer[socket.id];
    const p = room.players[pId];
    if (!p) return;
    const cardIdx = p.hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return;

    const card = p.hand.splice(cardIdx, 1)[0];
    room.slots = room.slots || { atk: null, def: null, effect: [], buffs: { atk: 0, def: 0 }, gaveUp: false };

    if (type === 'attack') {
      if (room.turnOrder[room.activeIdx] !== pId) {
        p.hand.push(card);
        return socket.emit('error_msg', '당신의 턴이 아닙니다!');
      }
      if (!room.currentTarget) {
        const aliveEnemies = Object.keys(room.players).filter(id => id !== pId && room.players[id].hp > 0);
        if (aliveEnemies.length === 1) {
          room.currentTarget = aliveEnemies[0];
          room.lastActivity = Date.now();
          room.turnStats = { effectUsed: false, mergeUsedBy: {} };
        } else {
          p.hand.push(card);
          return socket.emit('error_msg', '타겟을 먼저 선택해주세요!');
        }
      }
      if (room.slots.atk && room.slots.atk.ownerId === pId) p.hand.push(room.slots.atk.card);
      room.slots.atk = { card, ownerId: pId };
    } else if (type === 'defense') {
      if (room.currentTarget !== pId) {
        p.hand.push(card);
        return socket.emit('error_msg', '당신은 방어자가 아닙니다!');
      }
      if (!room.defenderPhaseStart) {
        p.hand.push(card);
        return socket.emit('error_msg', '공격자가 준비될 때까지 기다려주세요!');
      }
      if (room.slots.def && room.slots.def.ownerId === pId) p.hand.push(room.slots.def.card);
      room.slots.def = { card, ownerId: pId };
    } else if (type === 'effect') {
      if (room.turnOrder[room.activeIdx] === pId && !room.currentTarget) {
        const aliveEnemies = Object.keys(room.players).filter(id => id !== pId && room.players[id].hp > 0);
        if (aliveEnemies.length === 1) {
          room.currentTarget = aliveEnemies[0];
          room.lastActivity = Date.now();
        } else {
          p.hand.push(card);
          return socket.emit('error_msg', '타겟을 먼저 선택해주세요!');
        }
      }
      room.turnStats.effectUsed = true;
      switch (card.subType) {
        case EFFECT_SUBTYPES.HEAL:
          p.hp = Math.min(100, p.hp + 15);
          room.logs.push(`[아이템] ${p.name}이(가) 회복 약물을 사용했습니다. (+15 HP)`);
          break;
        case EFFECT_SUBTYPES.GRAIL:
          p.hp = 100;
          room.logs.push(`[성유물] ${p.name}이(가) 성배의 물을 마셨습니다! (HP 모두 회복)`);
          break;
        case EFFECT_SUBTYPES.WEAKEN:
          if (room.currentTarget && room.players[room.currentTarget]) {
            room.players[room.currentTarget].isWeakened = true;
            room.logs.push(`[아이템] ${p.name}이(가) ${room.players[room.currentTarget].name}을(를) 약화시켰습니다! (다음 공격 공격력 절반 감소)`);
          }
          break;
        case EFFECT_SUBTYPES.HASTE:
          for (let i = 0; i < 2; i++) {
            if (room.deck.length > 0) p.hand.push(room.deck.pop());
          }
          room.logs.push(`[아이템] ${p.name}이(가) 신속을 사용했습니다! (카드 2장 드로우)`);
          break;
        case EFFECT_SUBTYPES.REDRAW:
          p.hand = [];
          for (let i = 0; i < 5; i++) if (room.deck.length > 0) p.hand.push(room.deck.pop());
          room.logs.push(`[아이템] ${p.name}이(가) 시간을 되돌렸습니다! (패 전부 교체)`);
          break;
        case EFFECT_SUBTYPES.MANA_BURN:
          if (room.currentTarget && room.players[room.currentTarget]) {
            room.players[room.currentTarget].points = 0;
            room.logs.push(`[아이템] ${p.name}이(가) ${room.players[room.currentTarget].name}의 마나를 태워버렸습니다!`);
          }
          break;
        case EFFECT_SUBTYPES.SMOKE:
          p.isEvading = true;
          room.logs.push(`[아이템] ${p.name}이(가) 연막탄을 터뜨렸습니다! (다음 공격 회피)`);
          break;
        case EFFECT_SUBTYPES.MIGHT:
          p.currentBuffs.atk += 10;
          room.logs.push(`[아이템] ${p.name}이(가) 힘의 스크롤을 찢었습니다! (이번 라운드 공격력 +10)`);
          break;
        case EFFECT_SUBTYPES.PURIFY:
          p.statusEffects = [];
          room.logs.push(`[아이템] ${p.name}이(가) 자신의 심신을 정화했습니다! (상태이상 해제)`);
          break;
        case EFFECT_SUBTYPES.CONTRACT:
          p.hp = Math.max(1, p.hp - 20);
          p.points = 10;
          room.logs.push(`[이벤트] ${p.name}이(가) 영혼의 계약을 맺었습니다! (AP 최대치, HP -20)`);
          break;
        case EFFECT_SUBTYPES.PARADISE:
          Object.values(room.players).forEach(other => {
            if (other.id !== pId) other.hp -= 30;
          });
          room.logs.push(`🌌 실낙원 발동! 모든 적에게 30 데미지!`);
          if (checkMatchEnded(room)) return;
          break;
        case EFFECT_SUBTYPES.CROSSBOW:
          if (room.currentTarget && room.players[room.currentTarget]) {
            room.players[room.currentTarget].hp -= 15;
            room.logs.push(`[아이템] ${p.name}이(가) ${room.players[room.currentTarget].name}에게 석궁을 발사했습니다! (-15 HP)`);
            if (checkMatchEnded(room)) return;
          }
          break;
        case EFFECT_SUBTYPES.REFLECTOR:
          room.activeReflector = pId;
          room.logs.push(`[아이템] ${p.name}이(가) 반사 방패를 펼쳤습니다!`);
          break;
        case EFFECT_SUBTYPES.GATE_MAGIC:
        case EFFECT_SUBTYPES.TELEPORT:
        case EFFECT_SUBTYPES.MIRACLE:
        case EFFECT_SUBTYPES.ANGEL_WIND:
        case EFFECT_SUBTYPES.HOLY_LIGHT:
          triggerEnvironmentalEvent(room);
          room.logs.push(`[이벤트] ${p.name}이(가) 운명에 개입했습니다! (환경 변화)`);
          break;
        case EFFECT_SUBTYPES.COIN:
          const win = Math.random() < 0.5;
          if (win) {
            p.hp = Math.min(100, p.hp + 20);
            room.logs.push(`[아이템] ${p.name}의 행운의 동전: 앞면! (+20 HP)`);
          } else {
            p.hp = Math.max(1, p.hp - 10);
            room.logs.push(`[아이템] ${p.name}의 행운의 동전: 뒷면! (-10 HP)`);
          }
          break;
        default:
          room.logs.push(`[아이템] ${p.name}이(가) ${card.name}을(를) 사용했습니다.`);
          break;
      }
      room.logs.push(`${p.name} used ${card.name}`);
      if (checkMatchEnded(room)) return;
    }
    updateAllPlayers(room);
  });

  socket.on('ready_for_combat', ({ roomId }) => {
    try {
      const rId = roomId || socketToRoom[socket.id];
      const room = rooms[rId];
      if (!room || room.phase !== 'battle' || room.isResolving) return;

      const pId = socketToPlayer[socket.id];
      console.log(`[Combat] Ready request from ${pId} in ${rId}`);

      if (!room.readyForCombat.includes(pId)) {
        room.readyForCombat.push(pId);
      }

      const attackerId = room.turnOrder[room.activeIdx];
      const defenderId = room.currentTarget;

      // When attacker presses Battle Ready, start defender phase timer
      if (pId === attackerId && !room.defenderPhaseStart) {
        room.defenderPhaseStart = Date.now();
        console.log(`[Timer] Defender phase started for ${defenderId}`);

        if (room.slots.gaveUp) {
          console.log(`[Battle] Defender had already given up. Resolving...`);
          room.isResolving = true;
          setTimeout(() => resolveRound(room), 500);
          return;
        }
      }

      if (room.readyForCombat.length >= 2 && room.readyForCombat.includes(attackerId) && room.readyForCombat.includes(defenderId)) {
        // Start Sequential Reveal
        console.log(`[Battle] Both ready. Starting Sequential Reveal...`);
        room.isResolving = true; // Pause AFK timer
        room.revealState = 'attacker';
        updateAllPlayers(room);

        setTimeout(() => {
          room.revealState = 'both';
          updateAllPlayers(room);

          setTimeout(() => {
            room.revealState = null;
            resolveRound(room);
          }, 1500);
        }, 1500);
      } else {
        // Reset timer when someone presses ready
        room.lastActivity = Date.now();
        if (room.defenderPhaseStart) room.defenderPhaseStart = Date.now();
        updateAllPlayers(room);
      }
    } catch (err) {
      console.error("[CRITICAL] ready_for_combat error:", err);
    }
  });

  socket.on('execute_blood_pact', ({ roomId: rIdPayload }) => {
    const rId = rIdPayload || socketToRoom[socket.id];
    const room = rooms[rId];
    if (!room || room.phase !== 'battle' || room.isResolving) return;

    const pId = socketToPlayer[socket.id];
    const p = room.players[pId];
    if (!p) return;

    const cost = room.bloodPactCost || 25;
    p.hp -= cost;
    room.logs.push(`${p.name} activated Blood Pact (-${cost} HP).`);

    for (let i = 0; i < 2; i++) {
      if (room.deck.length > 0) p.hand.push(room.deck.pop());
    }

    room.lastActivity = Date.now();

    if (p.hp <= 0) {
      room.logs.push(`${p.name} sacrificed too much and perished.`);
      updateAllPlayers(room); // Show HP drop first
      advanceTurn(room);      // Then transition
      return;
    }
    updateAllPlayers(room);
  });

  socket.on('return_to_lobby', () => {
    const rId = socketToRoom[socket.id];
    const room = rooms[rId];
    const pId = socketToPlayer[socket.id];
    if (room && room.players[pId]) {
      room.phase = 'waiting';
      room.players[pId].ready = false;
      room.fieldEvent = null;
      room.roundCount = 0;
      updateAllPlayers(room);
    }
  });

  socket.on('character_ability', ({ roomId }) => {
    const rId = roomId || socketToRoom[socket.id];
    const room = rooms[rId];
    if (!room || room.phase !== 'battle' || room.isResolving) return;
    const pId = socketToPlayer[socket.id];
    const p = room.players[pId];
    if (!p || p.points < 5) return socket.emit('error_msg', 'Need 5 points for ability!');
    const isAttacker = room.turnOrder[room.activeIdx] === pId;
    const isDefender = room.currentTarget === pId;
    if (!isAttacker && !isDefender) return socket.emit('error_msg', 'Only usable on your turn (Attack/Defense)!');

    const needsTarget = isAttacker;
    if (needsTarget && !room.currentTarget) return socket.emit('error_msg', '먼저 대상을 선택하세요!');

    p.points -= 5;
    room.logs.push(`${p.name}이(가) ${p.heroClass === 'warrior' ? '전사' : p.heroClass === 'crusader' ? '성전사' : '암살자'} 어빌리티를 사용했습니다!`);

    switch (p.heroClass) {
      case 'warrior':
        p.currentBuffs.atk += 5;
        room.logs.push(` - 전사의 기백: 공격력 +5.`);
        break;
      case 'crusader':
        p.currentBuffs.def += 5;
        room.logs.push(` - 성전사의 방패: 방어력 +5.`);
        break;
      case 'assassin':
        const oppId = isAttacker ? room.currentTarget : room.turnOrder[room.activeIdx];
        if (oppId && room.players[oppId]) {
          room.players[oppId].hp = Math.max(0, room.players[oppId].hp - 10);
          room.logs.push(` - 암살자의 단검: ${room.players[oppId].name}에게 10 데미지.`);
          if (checkMatchEnded(room)) return;
        }
        break;
    }
    if (checkMatchEnded(room)) return;
    updateAllPlayers(room);
  });

  socket.on('give_up_defense', ({ roomId }) => {
    const rId = roomId || socketToRoom[socket.id];
    const room = rooms[rId];
    const pId = socketToPlayer[socket.id];
    if (!room || room.currentTarget !== pId) return;
    if (!room.defenderPhaseStart) return socket.emit('error_msg', 'Attacker is not ready yet!');

    room.slots = room.slots || {};
    room.slots.gaveUp = true;
    if (room.defenderPhaseStart && room.slots.atk) {
      console.log(`[Battle] ${room.players[pId].name} (수비자)가 수비를 포기했습니다.`);
      room.isResolving = true;
      setTimeout(() => resolveRound(room), 500);
    }
    updateAllPlayers(room);
  });

  socket.on('leave_room', ({ roomId }) => {
    const rId = roomId || socketToRoom[socket.id];
    const room = rooms[rId];
    if (room) {
      const pId = socketToPlayer[socket.id];
      delete room.players[pId];
      room.turnOrder = room.turnOrder.filter(id => id !== pId);
      socket.leave(rId);
      delete socketToRoom[socket.id];

      if (room.turnOrder.length === 0) {
        delete rooms[rId];
      } else {
        updateAllPlayers(room);
      }
    }
  });

  socket.on('recall_card', ({ type, roomId }) => {
    const rId = roomId || socketToRoom[socket.id];
    const room = rooms[rId];
    if (!room || room.phase !== 'battle' || room.isResolving) return;

    const pId = socketToPlayer[socket.id];
    const p = room.players[pId];
    if (!p) return;

    // Cannot recall after pressing BATTLE READY
    if (room.readyForCombat.includes(pId)) return socket.emit('error_msg', 'Cannot recall after confirming combat!');

    if (type === 'attack' && room.slots.atk && room.slots.atk.ownerId === pId) {
      p.hand.push(room.slots.atk.card);
      room.slots.atk = null;
      room.logs.push(`${p.name} recalled their attack card.`);
      updateAllPlayers(room);
    } else if (type === 'defense' && room.slots.def && room.slots.def.ownerId === pId) {
      if (!room.defenderPhaseStart) return socket.emit('error_msg', 'Cannot recall now!');
      p.hand.push(room.slots.def.card);
      room.slots.def = null;
      room.logs.push(`${p.name} recalled their defense card.`);
      updateAllPlayers(room);
    }
  });

  socket.on('merge_cards', (cardIds) => {
    const rId = socketToRoom[socket.id];
    const room = rooms[rId];
    if (!room) return;

    const pId = socketToPlayer[socket.id];
    const p = room.players[pId];

    // 1. Block merging of effect cards
    const effectCards = cardIds.map(id => p.hand.find(c => c.id === id)).filter(c => c && c.type === 'effect');
    if (effectCards.length > 0) return socket.emit('error_msg', 'Divine Law: Effect cards cannot be merged.');

    // Allow any player to merge once per turn
    room.turnStats = room.turnStats || { effectUsed: false, mergeUsedBy: {} };
    room.turnStats.mergeUsedBy = room.turnStats.mergeUsedBy || {};
    if (room.turnStats.mergeUsedBy[pId]) return socket.emit('error_msg', 'You can only merge ONCE per turn.');

    const selectedCards = p.hand.filter(c => cardIds.includes(c.id));
    const merged = mergeCards(selectedCards);
    if (merged) {
      p.hand = p.hand.filter(c => !cardIds.includes(c.id));
      p.hand.push(merged);
      if (merged.mergeCount >= 4) p.mergesAchieved++;
      room.turnStats.mergeUsedBy[pId] = true;
      updateAllPlayers(room);
    } else {
      socket.emit('error_msg', 'Merge failed: select 2-4 identical cards.');
    }
  });


  socket.on('disconnect', () => {
    handleDisconnect(socket);
  });
});

function handleDisconnect(socket) {
  const pId = socketToPlayer[socket.id];
  const rId = socketToRoom[socket.id];

  console.log(`[Socket] Disconnected: ${socket.id} (Player: ${pId})`);

  if (rId && rooms[rId]) {
    const room = rooms[rId];
    room.logs.push(`${room.players[pId]?.name || 'Unknown'} lost connection.`);

    if (room.phase !== 'waiting' && room.phase !== 'victory') {
      const p = room.players[pId];
      if (p) p.hp = 0; // Mark as dead if they leave during match
    }

    // Remove player from room data
    delete room.players[pId];
    room.turnOrder = room.turnOrder.filter(id => id !== pId);
    socket.leave(rId);

    // Reassign host if needed
    if (room.hostId === pId && room.turnOrder.length > 0) {
      room.hostId = room.turnOrder[0];
    }

    if (room.turnOrder.length === 0) {
      delete rooms[rId];
    } else {
      if (room.phase !== 'waiting' && room.phase !== 'victory') {
        checkMatchEnded(room);
      }
      updateAllPlayers(room);
    }
  }
  delete socketToRoom[socket.id];
  delete socketToPlayer[socket.id];
}

function startNewRound(room) {
  try {
    const roomId = String(room.id);
    console.log(`[GAME_INIT] round 1 for room ${roomId}`);

    room.roundCount = 0;
    room.eventDuration = 0;
    room.harshPactDuration = 0;
    room.bloodPactCost = 25;
    room.fieldEvent = null;

    room.deck = generateDeck(null);
    room.phase = 'battle';
    room.isResolving = false;
    room.activeIdx = 0;
    room.currentTarget = null;
    room.defenderPhaseStart = null;
    room.slots = { atk: null, def: null, effect: [], gaveUp: false };
    room.turnStats = { effectUsed: false, mergeUsedBy: {} };
    room.readyForCombat = [];
    room.logs.push(`--- Match Start (Round ${room.roundCount + 1}) ---`);

    Object.values(room.players).forEach(p => {
      p.hp = 100;
      p.points = 0;
      p.statusEffects = [];
      p.isEvading = false;
      p.isStunned = false;
      p.currentBuffs = { atk: 0, def: 0 };
      p.hand = room.deck.splice(0, 5);
      console.log(`   - Prep Player: ${p.name} (${p.id})`);
    });

    room.lastActivity = Date.now();

    // RELIABLE EMISSION: Broadcast + Direct per player fallback
    io.to(roomId).emit('match_started', { gameState: room });
    Object.keys(room.players).forEach(pId => {
      io.to(pId).emit('match_started', { gameState: getSanitizedState(room, pId) });
    });

    console.log(`[EMIT_SUCCESS] match_started for ${roomId}`);
  } catch (err) {
    console.error("[CRITICAL] startNewRound failed:", err);
    io.to(String(room.id)).emit('error_msg', 'Critical error during round start.');
  }
}

function applyEffect(player, card, room) {
  if (card.subType === EFFECT_SUBTYPES.BUFF) {
    player.currentBuffs.atk += card.value;
    player.currentBuffs.def += card.value;
  } else if (card.subType === EFFECT_SUBTYPES.HEAL) {
    player.hp = Math.min(100, player.hp + card.value);
  } else if (card.subType === EFFECT_SUBTYPES.DEBUFF) {
    // Apply to current target or next victim? 
    // Usually target.
    if (room.currentTarget) {
      const target = room.players[room.currentTarget];
      target.currentBuffs.atk -= card.value;
    }
  } else if (card.subType === EFFECT_SUBTYPES.SPEC_WIN) {
    player.fieldWinCard = card;
    checkSpecialWin(player, room);
  }
}

function checkSpecialWin(player, room) {
  if (player.fieldWinCard && player.mergesAchieved >= 5) {
    room.phase = 'victory';
    room.winnerId = player.id;
    io.to(room.id).emit('game_over', { gameState: room });
  }
}

function resolveRound(room) {
  try {
    const roomId = String(room.id);
    console.log(`[BATTLE_RESOLVE] Starting for room ${roomId}`);

    // 1. Race condition safeguard
    if (!room.slots || !room.slots.atk) {
      console.log("   - FAILED: No attack card found in slots.");
      return;
    }

    const atk = room.slots.atk;
    const def = room.slots.def;

    const attacker = room.players[atk.ownerId];
    const defender = room.players[room.currentTarget];

    // 2. Player existence safeguard
    if (!attacker || !defender) {
      console.error("[Battle] Critical Error: Attacker or Defender not found.");
      room.readyForCombat = [];
      room.slots = { atk: null, def: null, effect: [], buffs: { atk: 0, def: 0 }, gaveUp: false };
      room.currentTarget = null;
      room.lastActivity = Date.now();
      updateAllPlayers(room);
      return;
    }

    console.log(`[Battle] Resolving Duel: ${attacker.name} vs ${defender.name}`);

    const attackerBuffAtk = attacker.currentBuffs?.atk || 0;
    const defenderBuffDef = defender.currentBuffs?.def || 0;

    let finalAtkVal = Math.max(0, atk.card.value + attackerBuffAtk);
    if (attacker.isWeakened) {
      finalAtkVal = Math.floor(finalAtkVal / 2);
      room.logs.push(`[상태] ${attacker.name}의 공격이 약화되어 절반으로 감소했습니다!`);
      attacker.isWeakened = false;
    }
    const finalDefVal = Math.max(0, (def ? def.card.value : 0) + defenderBuffDef);

    const { atkDamage, defDamage, statusToInflict, reflectDmg } = resolveDuel(
      atk, def, attacker, defender, finalAtkVal, finalDefVal, room.fieldEvent
    );

    // CLASH EMISSION: Send the result BEFORE updating HP for animation sync
    const battleResult = {
      attackerId: attacker.id,
      defenderId: defender.id,
      atkVal: finalAtkVal,
      defVal: finalDefVal,
      atkDamage: atkDamage,
      defDamage: defDamage,
      result: finalAtkVal > finalDefVal ? 'atk_win' : (finalAtkVal < finalDefVal ? 'def_win' : 'draw')
    };
    io.to(room.id).emit('battle_result', battleResult);

    // Resolution Phase: Apply damage and logs after a short delay (for animations)
    setTimeout(() => {
      let targetToDamage = defender;
      if (room.activeReflector) {
        const players = Object.values(room.players).filter(p => p.hp > 0);
        targetToDamage = players[Math.floor(Math.random() * players.length)];
        room.logs.push(`🛡️ Reflector: Damage redirected to ${targetToDamage.name}!`);
      }

      attacker.hp -= atkDamage;
      targetToDamage.hp -= defDamage;

      if (statusToInflict && targetToDamage.hp > 0) {
        targetToDamage.statusEffects = targetToDamage.statusEffects || [];
        targetToDamage.statusEffects.push(statusToInflict);
        if (statusToInflict.type === 'stun') {
          targetToDamage.isStunned = true;
        }
        room.logs.push(` - Effect: ${targetToDamage.name} is afflicted with ${statusToInflict.type}!`);
      }
      if (atkDamage > 0) {
        room.logs.push(` - Reflect: ${attacker.name} took ${atkDamage} reflect dmg.`);
      }

      if (defDamage > 0) {
        attacker.points = Math.min(10, (attacker.points || 0) + 1); // Hit bonus
      }
      attacker.points = Math.min(10, (attacker.points || 0) + 1); // Base attack gain

      if (defDamage <= 0 && def) {
        defender.points = Math.min(10, (defender.points || 0) + 1); // Block bonus
      }

      updateAllPlayers(room);

      if (checkMatchEnded(room)) {
        room.isResolving = false;
        return;
      }

      // Advance turn after logs and HP reduction are fully visible
      setTimeout(() => {
        advanceTurn(room); // Cleanup and turn change happen here together
      }, 1500); // 3.5s -> 1.5s for faster pace
    }, 1500);
  } catch (err) {
    console.error("[CRITICAL] resolveRound Crashed:", err);
    if (room && room.id) {
      io.to(String(room.id)).emit('error_msg', 'Critical: Battle resolution failed.');
    }
  }
}

function advanceTurn(room, mode = 'normal') {
  // 1. Move Index & Cleanup
  room.isResolving = false; // UNLOCK FIRST THING

  // 2. Check Win/Match-End condition next
  if (checkMatchEnded(room)) return;

  room.slots = { atk: null, def: null, effect: [], buffs: { atk: 0, def: 0 }, gaveUp: false };
  room.readyForCombat = [];
  room.currentTarget = null;
  room.defenderPhaseStart = null; // Reset defender timer
  room.revealState = null; // Reset reveal
  room.turnStats = { effectUsed: false, mergeUsedBy: {} };
  room.activeReflector = null; // Reset reflector each turn

  if (mode === 'normal') {
    room.activeIdx = (room.activeIdx + 1) % room.turnOrder.length;
    if (room.activeIdx === 0) {
      return processRoundEnd(room);
    }
  }

  // Roll for Roulette on explicitly normal turn advancements or new round starts
  if (mode === 'normal' || mode === 'from_round_end') {
    // 20% Chance to trigger Divine Visit at start of NEW turn
    if (Math.random() < 0.2) {
      room.phase = 'roulette';
      room.rouletteEndTime = Date.now() + 4500;
      rollDivineVisit(room);
      return;
    }
  }

  let loopGuard = 0;
  while (room.players[room.turnOrder[room.activeIdx]].hp <= 0) {
    room.activeIdx = (room.activeIdx + 1) % room.turnOrder.length;
    loopGuard++;
    if (loopGuard >= room.turnOrder.length) {
      // Everyone is dead - trigger match end
      const alivePlayers = Object.values(room.players).filter(p => p.hp > 0);
      if (alivePlayers.length === 0) {
        room.phase = 'victory';
        room.winnerId = null;
        room.logs.push('All players have fallen. Draw!');
        io.to(String(room.id)).emit('game_over', { gameState: room });
      }
      return;
    }
  }

  const nextP = room.players[room.turnOrder[room.activeIdx]];
  nextP.isEvading = false;

  // 3. Field & Status Effects
  if (room.fieldEvent === 'blessed_land') {
    nextP.hp = Math.min(100, nextP.hp + 5);
    room.logs.push(`[필드] ${nextP.name}이(가) 축복의 땅에서 HP 5 회복.`);
  } else if (room.fieldEvent === 'cursed_land') {
    nextP.hp = Math.max(0, nextP.hp - 5);
    room.logs.push(`[필드] ${nextP.name}이(가) 저주의 땅에서 HP 5 감소.`);
  } else if (room.fieldEvent === 'golden_age') {
    nextP.points = Math.min(10, nextP.points + 2);
    room.logs.push(`[필드] 황금의 시대: ${nextP.name}이(가) AP +2 획득.`);
  }

  nextP.statusEffects = nextP.statusEffects.filter(eff => {
    nextP.hp -= eff.damagePerTurn;
    room.logs.push(`[Status] ${nextP.name} took ${eff.damagePerTurn} dmg from ${eff.type}.`);
    eff.duration -= 1;
    return eff.duration > 0;
  });

  // Check if they died from DOT
  if (nextP.hp <= 0) {
    room.logs.push(`${nextP.name} succumbed to status effects.`);
    return advanceTurn(room); // Recurse to skip them
  }

  // 4. Stun Check
  if (nextP.isStunned) {
    nextP.isStunned = false;
    room.logs.push(`[Status] ${nextP.name} is stunned and skips turn.`);
    return advanceTurn(room); // Recurse
  }

  // 5. Draw 2 Cards (Increased from 1)
  for (let i = 0; i < 2; i++) {
    if (room.deck.length > 0 && nextP.hand.length < 10) {
      nextP.hand.push(room.deck.pop());
    }
  }

  room.lastActivity = Date.now();
  updateAllPlayers(room);
}

// AFK Check & Roulette Loop
setInterval(() => {
  Object.keys(rooms).forEach(roomId => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.phase === 'battle' && !room.isResolving) {
      const now = Date.now();

      if (room.defenderPhaseStart && room.currentTarget) {
        const defender = room.players[room.currentTarget];
        if (now - room.defenderPhaseStart > 60000) {
          console.log(`[AFK] Defender ${room.currentTarget} timed out in room ${roomId}`);
          room.slots = room.slots || {};
          room.slots.gaveUp = true;
          if (room.slots.atk && !room.isResolving) {
            room.logs.push(`시간 초과. ${defender?.name || '수비자'}가 수비를 포기했습니다.`);
            room.isResolving = true;
            resolveRound(room);
          }
        }
      } else if (!room.defenderPhaseStart) {
        const attackerId = room.turnOrder[room.activeIdx];
        const attacker = room.players[attackerId];
        if (now - room.lastActivity > 60000) {
          console.log(`[AFK] Attacker ${attackerId} timed out in room ${roomId}`);
          room.logs.push(`시간 초과. ${attacker?.name || '공격자'}의 턴이 넘어갑니다.`);
          room.slots = { atk: null, def: null, effect: [], gaveUp: false };
          room.readyForCombat = [];
          room.currentTarget = null;
          advanceTurn(room);
        }
      }
    } else if (room.phase === 'roulette') {
      const now = Date.now();
      if (now > room.rouletteEndTime) {
        applyDivineOutcome(room);
        // phase and advanceTurn handled inside applyDivineOutcome per event type
      }
    }
  });
}, 1000);

// --- NEW SYSTEM LOGIC ---
function processRoundEnd(room) {
  room.roundCount = (room.roundCount || 0) + 1;

  // Reset round-persistent buffs for all players
  Object.values(room.players).forEach(p => {
    p.currentBuffs = { atk: 0, def: 0 };
  });

  if (room.harshPactDuration > 0) {
    room.harshPactDuration--;
    if (room.harshPactDuration <= 0) {
      room.bloodPactCost = 25;
      room.logs.push('⚖️ 피의 계약 비용이 25로 복구되었습니다.');
    }
  }

  if (room.eventDuration > 0) {
    room.eventDuration--;
    if (room.eventDuration <= 0) {
      room.logs.push(`🌌 필드 환경 변화가 종료되었습니다.`);
      room.fieldEvent = null;
    }
  }

  advanceTurn(room, 'from_round_end');
}

const FIELD_EVENTS = ['blessed_land', 'cursed_land', 'abyssal_fog', 'golden_age', 'blood_festival'];

function triggerEnvironmentalEvent(room, forcedChoice) {
  const nextEvent = forcedChoice || FIELD_EVENTS[Math.floor(Math.random() * FIELD_EVENTS.length)];

  if (room.fieldEvent === nextEvent) {
    room.logs.push(`[이벤트] ${nextEvent} 이벤트가 갱신되었습니다!`);
  } else {
    room.logs.push(`[이벤트] 환경이 변화하였습니다: ${nextEvent}`);
  }

  room.fieldEvent = nextEvent;
  room.eventDuration = 4;

  // Draw 1 event card for EVERYONE (Unique draw per player)
  Object.values(room.players).forEach(p => {
    const pool = getEventCardPool(nextEvent);
    if (!pool || pool.length === 0) return;
    const randomCard = pool[Math.floor(Math.random() * pool.length)];
    const actualCard = { ...randomCard, id: `ev_draw_${p.id}_${Math.random().toString(36)}` };

    p.hand.push(actualCard);

    const socketId = playerToSocket[p.id];
    if (socketId) {
      io.to(socketId).emit('environment_draw', {
        event: nextEvent,
        cards: [actualCard] // Single card
      });
    }
  });

  // Inject limited event cards so they don't clog the deck forever
  const eventPool = getEventCardPool(nextEvent);
  const numPlayers = Object.keys(room.players).length;
  const injectionCount = numPlayers * 2; // Small batch

  const injection = Array(injectionCount).fill(null).map(() => ({
    ...eventPool[Math.floor(Math.random() * eventPool.length)],
    id: `ev_deck_${Math.random().toString(36)}`
  }));
  room.deck.unshift(...injection);
  // Shuffle slightly
  for (let i = 0; i < 30 && i < room.deck.length; i++) {
    const j = Math.floor(Math.random() * (i + 1));
    [room.deck[i], room.deck[j]] = [room.deck[j], room.deck[i]];
  }

  updateAllPlayers(room);
}

// === 성령의 방문: 일회성 효과만 (환경 이벤트와 완전 분리) ===
const DIVINE_EVENTS = {
  heal_all: { title: '✨ 성령의 은총', desc: '성령의 은총으로 모두의 HP가 20 회복됩니다.' },
  harsh_pact: { title: '⚖️ 가혹한 계약', desc: '가혹한 계약이 발동됩니다. 피의 계약 비용이 40으로 증가합니다.' },
  card_rain: { title: '🃏 운명의 카드', desc: '하늘에서 카드가 쏟아집니다! 모든 플레이어가 카드 2장을 획득합니다.' },
  mana_surge: { title: '💎 마나 폭주', desc: '마나가 폭주합니다! 모든 플레이어의 AP가 3 증가합니다.' },
  soul_tax: { title: '👁️ 영혼의 대가', desc: '심연이 대가를 요구합니다. 모든 플레이어의 HP가 15 감소합니다.' },
  shuffle_fate: { title: '🔄 운명의 수레바퀴', desc: '운명이 뒤바뀝니다! 모든 플레이어의 패가 교체됩니다.' },
};

function rollDivineVisit(room) {
  const outcomes = Object.keys(DIVINE_EVENTS);
  room.currentRouletteResult = outcomes[Math.floor(Math.random() * outcomes.length)];
  const eventInfo = DIVINE_EVENTS[room.currentRouletteResult];

  io.to(String(room.id)).emit('divine_visit_start', {
    result: room.currentRouletteResult,
    title: eventInfo.title,
    desc: eventInfo.desc
  });
  updateAllPlayers(room);
}

function applyDivineOutcome(room) {
  const event = room.currentRouletteResult;
  room.currentRouletteResult = null;

  if (!event || !DIVINE_EVENTS[event]) {
    room.phase = 'battle';
    advanceTurn(room, 'from_roulette');
    return;
  }

  const eventInfo = DIVINE_EVENTS[event];
  room.logs.push(`🕊️ 성령의 방문: ${eventInfo.title}`);

  switch (event) {
    case 'heal_all':
      Object.values(room.players).forEach(p => {
        p.hp = Math.min(100, p.hp + 20);
      });
      room.logs.push('✨ 모든 플레이어의 HP가 20 회복되었습니다!');
      break;
    case 'harsh_pact':
      room.bloodPactCost = 40;
      room.harshPactDuration = 3;
      room.logs.push('⚖️ 피의 계약 비용이 3라운드 동안 40으로 증가합니다!');
      break;
    case 'card_rain':
      Object.values(room.players).forEach(p => {
        for (let i = 0; i < 2; i++) {
          if (room.deck.length > 0 && p.hand.length < 10) {
            p.hand.push(room.deck.pop());
          }
        }
      });
      room.logs.push('🃏 모든 플레이어가 카드 2장을 획득했습니다!');
      break;
    case 'mana_surge':
      Object.values(room.players).forEach(p => {
        p.points = Math.min(10, (p.points || 0) + 3);
      });
      room.logs.push('💎 모든 플레이어의 AP가 3 증가했습니다!');
      break;
    case 'soul_tax':
      Object.values(room.players).forEach(p => {
        p.hp = Math.max(1, p.hp - 15);
      });
      room.logs.push('👁️ 심연이 대가를 요구합니다. 모든 플레이어의 HP가 15 감소했습니다!');
      break;
    case 'shuffle_fate':
      Object.values(room.players).forEach(p => {
        room.deck.push(...p.hand);
        p.hand = [];
        for (let i = room.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [room.deck[i], room.deck[j]] = [room.deck[j], room.deck[i]];
        }
        for (let i = 0; i < 5; i++) {
          if (room.deck.length > 0) p.hand.push(room.deck.pop());
        }
      });
      room.logs.push('🔄 운명이 뒤바뀌었습니다! 모든 플레이어의 패가 교체되었습니다!');
      break;
  }

  if (checkMatchEnded(room)) return;

  room.phase = 'battle';
  advanceTurn(room, 'from_roulette');
  updateAllPlayers(room);
}

// 프로덕션: 모든 비-API 경로를 클라이언트 index.html로 라우팅 (SPA 지원)
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

server.listen(PORT, () => console.log(`Magic Fight Server listening on port ${PORT}`));
