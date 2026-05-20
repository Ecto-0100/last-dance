import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './index.css';

const SERVER_URL = import.meta.env.PROD
   ? window.location.origin           // 배포 환경: 같은 서버에서 서빙
   : 'http://localhost:3001';          // 개발 환경: 로컬 서버
const socket = io(SERVER_URL);

import warriorImg from './assets/warrior.png';
import crusaderImg from './assets/crusader.png';
import assassinImg from './assets/assassin.png';
import divineCardBackImg from './assets/divine_card_back.png';
import eventCardBackImg from './assets/event_card_back.png';

const HERO_CLASSES = [
   { id: 'warrior', name: '전사', desc: '전사의 기백: 현재 공격 카드에 공격력 +5.', icon: '⚔️', image: warriorImg },
   { id: 'crusader', name: '성전사', desc: '성전사의 방패: 현재 방어 카드에 방어력 +5.', icon: '🛡️', image: crusaderImg },
   { id: 'assassin', name: '암살자', desc: '암살자의 단검: 공격자에게 10 데미지.', icon: '🗡️', image: assassinImg }
];

const ROULETTE_OPTIONS = [
   { id: 'heal_all', label: 'Heal All (+10 HP)', icon: '✨' },
   { id: 'harsh_pact', label: 'Harsh Pact (Blood: 40)', icon: '⚖️' },
   { id: 'blessed_land', label: 'Event: Blessed Land', icon: '☀️' },
   { id: 'cursed_land', label: 'Event: Cursed Land', icon: '💀' },
   { id: 'dud', label: 'Kwang! (Nothing)', icon: '💨' }
];
const getEnvironmentDetails = (evt) => {
   switch (evt) {
      case 'blessed_land':
         return { title: '축복받은 땅', icon: '☀️', color: 'var(--accent-gold)', desc: '빛의 성령이 대지를 축복하며 신성한 카드가 지급되었습니다.' };
      case 'cursed_land':
         return { title: '저주받은 땅', icon: '💀', color: 'var(--accent-red)', desc: '심연의 저주가 대지를 감싸며 불길한 카드가 지급되었습니다.' };
      case 'abyssal_fog':
         return { title: '심연의 안개', icon: '🌫️', color: '#a080ff', desc: '자욱한 환각의 안개 속에서 몽환적인 카드가 지급되었습니다.' };
      case 'golden_age':
         return { title: '황금기', icon: '👑', color: '#ffd700', desc: '번영과 찬란한 황금의 축복과 함께 풍요로운 카드가 지급되었습니다.' };
      case 'blood_festival':
         return { title: '피의 축제', icon: '🩸', color: '#ff3b30', desc: '대지에 흐르는 피와 격노의 소용돌이 속에서 살육의 카드가 지급되었습니다.' };
      default:
         return { title: '미지의 차원', icon: '🔮', color: '#fff', desc: '차원의 격변이 일어나며 정체불명의 카드가 지급되었습니다.' };
   }
};

export default function App() {
   const [appState, setAppState] = useState('title');
   const [name, setName] = useState('');
   const [gameState, setGameState] = useState(null);
   const [roomId, setRoomId] = useState('');
   const [errorMsg, setErrorMsg] = useState('');
   const [persistentId, setPersistentId] = useState('');
   const [countdown, setCountdown] = useState(0);
   const [bloodFlash, setBloodFlash] = useState(false);
   const [npcMessage, setNpcMessage] = useState("Welcome to the abyss...");
   const [shakingPlayerId, setShakingPlayerId] = useState(null);
   const [inspectedCard, setInspectedCard] = useState(null);
   const [inspectedHero, setInspectedHero] = useState(null);
   const [showBloodPactConfirm, setShowBloodPactConfirm] = useState(false);

   const [showPopup, setShowPopup] = useState(false);
   const [maxPlayers, setMaxPlayers] = useState(2);
   const [joinIdInput, setJoinIdInput] = useState('');
   const [popupView, setPopupView] = useState('choice');
   const [isTransitioning, setIsTransitioning] = useState(false);
   const [hoveredLobbyBtn, setHoveredLobbyBtn] = useState(null);

   // 2.0 Class Selection
   const [isClassMenuOpen, setIsClassMenuOpen] = useState(false);
   const [tempClass, setTempClass] = useState('warrior');

   const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
   const [selectedCards, setSelectedCards] = useState([]);

   const [combatVisual, setCombatVisual] = useState(null);
   const [damageDealt, setDamageDealt] = useState(null);
   const [isRevealing, setIsRevealing] = useState(false);
   const animationTimer = useRef(null);

   const [divineVisit, setDivineVisit] = useState(null);
   const [divineFlipped, setDivineFlipped] = useState(false);
   const [revealingEventCards, setRevealingEventCards] = useState(null);
   const [flippedIndices, setFlippedIndices] = useState([]);
   const [isEnvironmentShaking, setIsEnvironmentShaking] = useState(false);
   const [showEnvironmentWave, setShowEnvironmentWave] = useState(null);

   const [tick, setTick] = useState(0);
   useEffect(() => {
      const timer = setInterval(() => setTick(t => t + 1), 1000);
      return () => clearInterval(timer);
   }, []);

   useEffect(() => {
      // Persistent Identity (Tab-specific for easier multi-tab testing)
      let pId = sessionStorage.getItem('magic_fight_player_id');
      if (!pId) {
         pId = 'p-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
         sessionStorage.setItem('magic_fight_player_id', pId);
      }
      setPersistentId(pId);

      const handleConnect = () => console.log("[NET] Connected:", socket.id);

      socket.on('room_joined', ({ roomId, gameState }) => {
         console.log(`[NET] Joined room ${roomId}`, gameState);
         setGameState(gameState);
         setRoomId(roomId);
         setAppState('waiting');
         setShowPopup(false);
      });

      socket.on('match_started', ({ gameState }) => {
         console.log("[NET] handleMatchStarted RECEIVED:", gameState.id);
         setGameState(gameState);
         if (gameState.id) setRoomId(gameState.id);
         setAppState('battle');
         setShowPopup(false);
         setCountdown(3);
      });

      const handleRoomUpdated = ({ gameState: gs }) => {
         console.log("[NET] handleRoomUpdated:", gs.phase, gs.id);
         setGameState(gs);
         if (gs.id) setRoomId(gs.id);

         setAppState(current => {
            if (gs.phase === 'waiting' && (current === 'lobby' || current === 'room_popup' || current === 'title')) {
               setShowPopup(false);
               return 'waiting';
            }
            return current;
         });
      };
      const handleUpdateState = ({ gameState: gs }) => {
         console.log("[NET] handleUpdateState:", gs.phase, gs.id);
         setGameState(gs);
         if (gs.id) setRoomId(gs.id);
         setAppState(current => (gs.phase === 'victory' ? 'victory' : current));
      };
      const handleBattleResult = (result) => {
         setIsRevealing(true);
         setCombatVisual({ status: 'clashing', ...result });
         animationTimer.current = setTimeout(() => {
            setCombatVisual(prev => ({ ...prev, status: 'flying' }));
            animationTimer.current = setTimeout(() => {
               setCombatVisual(prev => ({ ...prev, status: 'impacted' }));
               if (result.defDamage > 0) {
                  setDamageDealt({ playerId: result.defenderId, amount: result.defDamage });
                  setShakingPlayerId(result.defenderId);
               }
               if (result.atkDamage > 0) {
                  setDamageDealt({ playerId: result.attackerId, amount: result.atkDamage });
                  setShakingPlayerId(result.attackerId);
               }
               animationTimer.current = setTimeout(() => {
                  setCombatVisual(null);
                  setIsRevealing(false);
                  setDamageDealt(null);
                  setShakingPlayerId(null);
               }, 850);
            }, 350);
         }, 600);
      };
      const handleGameOver = ({ gameState: gs }) => { setGameState(gs); setAppState('victory'); };
      const handleKicked = () => { alert("방장에 의해 강퇴되었습니다."); setAppState('lobby'); setGameState(null); setShowPopup(false); };
      const handleErrorMsg = (msg) => { setErrorMsg(msg); setTimeout(() => setErrorMsg(''), 3000); };

      const handleDivineVisit = ({ result, title, desc }) => {
         setDivineVisit({ result, title, desc });
         setDivineFlipped(false);
         setTimeout(() => setDivineFlipped(true), 1500);
         setTimeout(() => setDivineVisit(null), 5500);
      };

      const handleEnvironmentDraw = ({ event, cards }) => {
         setIsEnvironmentShaking(true);
         setTimeout(() => setIsEnvironmentShaking(false), 1000);

         setShowEnvironmentWave(event);
         setTimeout(() => setShowEnvironmentWave(null), 1800);

         setTimeout(() => {
            setRevealingEventCards({ event, cards });
            setFlippedIndices([]);
            cards.forEach((_, index) => {
               setTimeout(() => {
                  setFlippedIndices(prev => [...prev, index]);
               }, 1000 + index * 600);
            });
         }, 500);

         setTimeout(() => setRevealingEventCards(null), 6500);
      };

      socket.on('connect', handleConnect);
      socket.on('room_updated', handleRoomUpdated);
      socket.on('update_state', handleUpdateState);
      socket.on('battle_result', handleBattleResult);
      socket.on('game_over', handleGameOver);
      socket.on('kicked', handleKicked);
      socket.on('error_msg', handleErrorMsg);
      socket.on('divine_visit_start', handleDivineVisit);
      socket.on('environment_draw', handleEnvironmentDraw);

      return () => {
         socket.off('connect', handleConnect);
         socket.off('room_updated', handleRoomUpdated);
         socket.off('update_state', handleUpdateState);
         socket.off('battle_result', handleBattleResult);
         socket.off('game_over', handleGameOver);
         socket.off('kicked', handleKicked);
         socket.off('error_msg', handleErrorMsg);
         socket.off('divine_visit_start', handleDivineVisit);
         socket.off('environment_draw', handleEnvironmentDraw);
         if (animationTimer.current) clearTimeout(animationTimer.current);
      };
   }, []);

   // Countdown Logic
   useEffect(() => {
      if (countdown > 0) {
         const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
         return () => clearTimeout(timer);
      }
   }, [countdown]);

   const handleTitleClick = (e) => {
      if (e.target.tagName.toLowerCase() === 'input' || !name.trim()) return;
      setIsTransitioning(true);
      setTimeout(() => {
         setAppState('lobby');
         setIsTransitioning(false);
      }, 1500);
   };
   const openRoomPopup = (size) => { setMaxPlayers(size); setPopupView('choice'); setShowPopup(true); };
   const createRoom = () => {
      if (!name.trim()) return alert('이름을 입력해주세요.');
      socket.emit('create_room', { name, maxPlayers, playerId: persistentId });
   };
   const joinRoom = () => {
      if (!name.trim() || !joinIdInput.trim()) return alert('이름과 방 ID를 입력해주세요.');
      socket.emit('join_room', { name, roomId: joinIdInput, playerId: persistentId });
   };
   const toggleReady = () => { const p = gameState.players[persistentId]; if (p) socket.emit('set_ready', !p.ready); };
   const startMatch = () => socket.emit('start_match');
   const kickPlayer = (targetId) => socket.emit('kick_player', { targetId });
   const leaveRoom = () => {
      socket.emit('leave_room', { roomId: gameState?.id });
      setAppState('lobby');
   };
   const giveUpDefense = () => socket.emit('give_up_defense', { roomId: gameState.id });

   // Class Select
   const selectClass = () => {
      socket.emit('select_class', tempClass);
      setIsClassMenuOpen(false);
   };

   const useAbility = () => {
      socket.emit('character_ability', { roomId: gameState.id });
   };

   const skipTurn = () => {
      socket.emit('forfeit_attack', { roomId: gameState.id });
   };

   const fieldClass = gameState?.fieldEvent ? `field-${gameState.fieldEvent}` : '';
   const hideResolvedSlots = gameState?.isResolving && !isRevealing;

   return (
      <div className={`screen-container ${fieldClass} ${bloodFlash ? 'blood-flash-active' : ''} ${isEnvironmentShaking ? 'environment-heavy-shake' : ''}`}>
         {showEnvironmentWave && (
            <div className={`environmental-wave-overlay ${showEnvironmentWave}`} />
         )}
         {errorMsg && <div className="error-toast">{errorMsg}</div>}

         {appState === 'title' && (
            <div
               className={`title-screen-bg ${isTransitioning ? 'door-open-transition' : ''}`}
               onClick={handleTitleClick}
            >
               <h1 className="title-text">MAGIC FIGHT</h1>
               <input type="text" className="input-box" placeholder="영웅의 이름을 입력하세요" maxLength={8} value={name} onChange={e => setName(e.target.value)} onClick={(e) => e.stopPropagation()} />
               {name.trim() && !isTransitioning && <div className="blink-text font-gothic">아무 곳이나 클릭해 시작</div>}
            </div>
         )}

         {appState === 'lobby' && (
            <div className={`lobby-screen-bg ${hoveredLobbyBtn ? 'pointing' : ''}`}>
               <div className="lobby-container">
                  <div className="menu-area">
                     <button
                        className="lobby-btn"
                        onMouseEnter={() => setHoveredLobbyBtn(2)}
                        onMouseLeave={() => setHoveredLobbyBtn(null)}
                        onClick={() => openRoomPopup(2)}
                     >2인 대전</button>
                     <button
                        className="lobby-btn"
                        onMouseEnter={() => setHoveredLobbyBtn(3)}
                        onMouseLeave={() => setHoveredLobbyBtn(null)}
                        onClick={() => openRoomPopup(3)}
                     >3인 대전</button>
                     <button
                        className="lobby-btn"
                        onMouseEnter={() => setHoveredLobbyBtn(4)}
                        onMouseLeave={() => setHoveredLobbyBtn(null)}
                        onClick={() => openRoomPopup(4)}
                     >4인 대전</button>
                  </div>
               </div>
            </div>
         )}

         {showPopup && (
            <div className="overlay">
               <div className="popup-box">
                  <button className="btn" style={{ position: 'absolute', top: '10px', left: '10px', padding: '5px 10px' }} onClick={() => setShowPopup(false)}>뒤로</button>
                  {popupView === 'choice' ? (
                     <div className="text-center" style={{ marginTop: '2rem' }}>
                        <h2 className="font-gothic">방 선택</h2>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                           <button className="btn" onClick={createRoom}>방 만들기</button>
                           <button className="btn" onClick={() => setPopupView('join')}>방 참여</button>
                        </div>
                     </div>
                  ) : (
                     <div className="text-center" style={{ marginTop: '2rem' }}>
                        <h2 className="font-gothic">방 참여</h2>
                        <input className="input-box" placeholder="방 ID 입력" value={joinIdInput} onChange={e => setJoinIdInput(e.target.value)} />
                        <br /><br /><button className="btn" onClick={joinRoom}>입장</button>
                     </div>
                  )}
               </div>
            </div>
         )}

         {appState === 'waiting' && gameState && (
            <div className="text-center" style={{ width: '100%', position: 'relative' }}>
               <button className="btn" style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 100, fontSize: '1.2rem', padding: '10px 20px' }} onClick={leaveRoom}>◀ BACK</button>
               <button className="room-id-badge clickable" style={{ position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 100, marginBottom: 0 }} onClick={() => navigator.clipboard.writeText(roomId)}>Room ID: <span style={{ color: 'var(--accent-gold)' }}>{roomId}</span></button>

               <div className="portraits-row" style={{ justifyContent: 'center', marginTop: '6rem', alignItems: 'stretch' }}>
                  {Array.from({ length: gameState.maxPlayers }).map((_, i) => {
                     const id = gameState.turnOrder[i];
                     if (!id) {
                        return (
                           <div key={`empty-${i}`} className="player-card-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '220px' }}>
                              <div className="player-card empty-slot" style={{ width: '100%', flex: 1, minHeight: '350px', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: '#555', border: '4px dashed #444', borderRadius: '10px' }}>대기 중...</div>
                           </div>
                        );
                     }
                     const p = gameState.players[id];
                     const char = HERO_CLASSES.find(c => c.id === p.heroClass);
                     const isMe = id === persistentId;
                     const isHost = gameState.hostId === id;
                     const canChangeClass = isMe && (!p.ready || isHost);

                     return (
                        <div key={id} className="player-card-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '220px' }}>
                           <div className={`player-card ${p.ready ? 'ready' : ''}`} style={{ width: '100%', flex: 1 }}>
                              <div className="lobby-portrait" style={{ height: '250px', backgroundColor: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '5rem', borderRadius: '8px 8px 0 0', overflow: 'hidden' }}>
                                 {char?.image ? (
                                    <img src={char.image} alt={char.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 ) : (
                                    char?.icon
                                 )}
                              </div>
                              <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'space-between' }}>
                                 <div>
                                    <div className="font-gothic" style={{ fontSize: '1.2rem', textAlign: 'center' }}>{p.name} {isHost && '👑'}</div>
                                    <div style={{ fontSize: '0.9rem', color: '#ccc', textAlign: 'center' }}>[{char?.name}]</div>
                                 </div>
                                 <div style={{ fontSize: '1rem', color: 'var(--accent-gold)', fontWeight: 'bold', textAlign: 'center' }}>{p.ready ? 'READY' : 'SELECTING...'}</div>
                                 {isMe && (
                                    <button
                                       className="btn"
                                       onClick={() => setIsClassMenuOpen(true)}
                                       disabled={!canChangeClass}
                                       style={{ width: '100%', fontSize: '0.9rem', padding: '8px', marginTop: '5px' }}
                                    >
                                       클래스 변경
                                    </button>
                                 )}
                              </div>
                           </div>
                        </div>
                     )
                  })}
               </div>

               <div style={{ marginTop: '4rem', display: 'flex', justifyContent: 'center' }}>
                  {gameState.hostId === persistentId ? (
                     <button className="btn btn-large" disabled={!Object.values(gameState.players).every(p => p.ready) || gameState.turnOrder.length < 2} onClick={startMatch}>결투 시작</button>
                  ) : (
                     <button className="btn btn-large" onClick={toggleReady}>{gameState.players[persistentId]?.ready ? '준비 취소' : '준비 완료'}</button>
                  )}
               </div>
            </div>
         )}

         {isClassMenuOpen && (
            <div className="overlay" style={{ zIndex: 5000 }}>
               <div className="popup-box" style={{ width: '90%', maxWidth: '1000px', position: 'relative', paddingTop: '4rem', paddingBottom: '8rem' }}>
                  <button className="btn" style={{ position: 'absolute', top: '15px', left: '15px', padding: '10px 20px', fontSize: '1.2rem' }} onClick={() => setIsClassMenuOpen(false)}>◀ 뒤로</button>
                  <h1 className="font-gothic text-center" style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', margin: 0 }}>클래스 선택</h1>
                  <div className="class-grid" style={{ marginTop: '2rem', marginBottom: '4rem' }}>
                     {HERO_CLASSES.map(c => {
                        const isGlobalSelected = gameState.players[persistentId].heroClass === c.id;
                        const isActiveTrial = tempClass === c.id;
                        return (
                           <div
                              key={c.id}
                              className={`class-card ${isGlobalSelected ? 'selected' : ''} ${isActiveTrial ? 'active-selection highlight-new' : ''}`}
                              onClick={() => setTempClass(c.id)}
                              style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '400px' }}
                           >
                              {isGlobalSelected && <div className="selected-label">장착 중</div>}
                              {/* 상단: 일러스트 (가장 큼) */}
                              <div className="class-illustration-container" style={{ flex: '3', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
                                 {c.image ? (
                                    <img src={c.image} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 ) : (
                                    <div style={{ fontSize: '6rem' }}>{c.icon}</div>
                                 )}
                              </div>
                              {/* 중단: 클래스 이름 */}
                              <div className="font-gothic" style={{ flex: '0.5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', color: isGlobalSelected ? 'var(--accent-gold)' : 'white', marginTop: '1rem' }}>
                                 {c.name}
                              </div>
                              {/* 하단: 어빌리티 설명 */}
                              <div style={{ flex: '1.5', fontSize: '1rem', color: '#aaa', marginTop: '0.5rem', textAlign: 'center', padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                 {c.desc}
                              </div>
                           </div>
                        );
                     })}
                  </div>
                  <div style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)' }}>
                     <button className="btn btn-large" disabled={gameState.players[persistentId].heroClass === tempClass} onClick={selectClass}>선택 확정</button>
                  </div>
               </div>
            </div>
         )}

         {appState === 'battle' && gameState && (
            <div className="game-board">
               {renderPlayerZone(getPositionData().north, 'north')}
               {renderPlayerZone(getPositionData().west, 'west')}
               {renderPlayerZone(getPositionData().east, 'east')}

               <div className="battle-field-center">
                  {gameState.phase === 'battle' && !gameState.currentTarget && gameState.turnOrder[gameState.activeIdx] === persistentId && (
                     <h2 className="font-gothic pulse-text" style={{ color: 'var(--accent-gold)' }}>공격 대상을 선택하세요</h2>
                  )}
                  {gameState.phase === 'battle' && (() => {
                     const isDefenderPhase = !!gameState.defenderPhaseStart;
                     const attackerId = gameState.turnOrder[gameState.activeIdx];

                     // I am the timer target only if it's MY phase
                     const isMeTimerTarget = isDefenderPhase
                        ? gameState.currentTarget === persistentId   // Defender's timer: only show to defender
                        : attackerId === persistentId;               // Attacker's timer: only show to attacker

                     // Hide timer entirely if I'm not the one on the clock or battle is resolving
                     if (!isMeTimerTarget || gameState.isResolving) return null;

                     const elapsed = isDefenderPhase
                        ? Math.floor((Date.now() - gameState.defenderPhaseStart) / 1000)
                        : Math.floor((Date.now() - gameState.lastActivity) / 1000);
                     const remaining = Math.max(0, 60 - elapsed);
                     const isWarning = remaining < 15;

                     return (
                        <div className={`timeout-timer ${isWarning ? 'warning' : ''}`}
                           style={{ color: isDefenderPhase ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.1)' }}>
                           {remaining}
                        </div>
                     );
                  })()}
                  <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', position: 'relative' }}>
                     <div className="slot-container" style={{ textAlign: 'center' }}>
                        <div className={`card-slot atk-slot ${gameState.slots?.atk ? '' : 'empty'} ${combatVisual?.status === 'clashing' ? 'clashing' : ''} ${combatVisual?.status === 'flying' && combatVisual.result === 'atk_win' ? 'projectile' : ''} ${combatVisual?.status === 'flying' && combatVisual.result === 'def_win' ? 'deflected' : ''} ${combatVisual?.status === 'flying' && combatVisual.result === 'draw' ? 'clashing-draw' : ''} ${combatVisual?.status === 'impacted' && (combatVisual.result === 'atk_win' || combatVisual.result === 'def_win') ? 'invisible-card' : ''} ${combatVisual?.status === 'impacted' && combatVisual.result === 'draw' ? 'shattering' : ''} ${(gameState.revealState === 'attacker' || gameState.revealState === 'both') ? 'revealing' : ''}`}
                           onDragOver={e => e.preventDefault()}
                           onDrop={e => {
                              const cardData = JSON.parse(e.dataTransfer.getData("card"));
                              if (cardData.type === 'attack') socket.emit('submit_card', { cardId: cardData.id, type: 'attack', roomId: gameState.id });
                           }}
                           style={{ '--tx': getTargetOffset(combatVisual?.defenderId).x + 'px', '--ty': getTargetOffset(combatVisual?.defenderId).y + 'px' }}
                        >
                           {gameState.slots?.atk && !hideResolvedSlots && (
                              <Card
                                 card={gameState.slots.atk.card}
                                 ownerId={gameState.slots.atk.ownerId}
                                 displayValue={gameState.slots.atk.card.value + (gameState.players[gameState.slots.atk.ownerId]?.currentBuffs?.atk || 0)}
                                 isBuffed={gameState.players[gameState.slots.atk.ownerId]?.currentBuffs?.atk > 0}
                                 isFogged={gameState.fieldEvent === 'abyssal_fog' && gameState.slots.atk.ownerId !== persistentId}
                                 revealForce={isRevealing || gameState.revealState === 'attacker' || gameState.revealState === 'both'}
                                 onContextMenu={(e) => { e.preventDefault(); setInspectedCard(gameState.slots.atk.card); }}
                                 onClick={() => {
                                    if (gameState.slots.atk.ownerId === persistentId && !gameState.readyForCombat.includes(persistentId))
                                       socket.emit('recall_card', { type: 'attack', roomId: gameState.id });
                                 }}
                                 style={{
                                    cursor: 'pointer',
                                    outline: gameState.slots.atk.ownerId === persistentId ? '2px dashed var(--accent-gold)' : 'none'
                                 }}
                              />
                           )}
                        </div>
                        <span className="font-gothic" style={{ fontSize: '0.8rem' }}>공격석</span>
                     </div>
                     {gameState.phase === 'battle' && gameState.slots?.atk && !gameState.isResolving && !gameState.slots?.gaveUp && gameState.readyForCombat.length < 2 && (
                        (gameState.turnOrder[gameState.activeIdx] === persistentId) ||
                        (gameState.currentTarget === persistentId && gameState.readyForCombat.some(rid => rid === gameState.turnOrder[gameState.activeIdx]))
                     ) && (
                           <div style={{ position: 'absolute', zIndex: 100, left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                              <button className="btn-ready"
                                 style={{ animation: !gameState.readyForCombat.includes(persistentId) ? 'pulseGold 1.5s infinite' : 'none' }}
                                 disabled={gameState.readyForCombat.includes(persistentId)}
                                 onClick={() => socket.emit('ready_for_combat', { roomId: gameState.id })}>
                                 {gameState.readyForCombat.includes(persistentId) ? '상대방 대기 중...' : '전투 준비'}
                              </button>
                           </div>
                        )}

                     {/* CLASH RESULT BANNER */}
                     {(combatVisual?.status === 'impacted' || combatVisual?.status === 'flying') && (
                        <div className="battle-result-banner" style={{
                           position: 'absolute',
                           top: '-100px',
                           left: '50%',
                           transform: 'translateX(-50%)',
                           zIndex: 200,
                           animation: 'popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
                        }}>
                           {combatVisual.result === 'atk_win' && <h1 style={{ color: 'var(--accent-red)', textShadow: '0 0 20px var(--accent-red)' }}>공격!</h1>}
                           {combatVisual.result === 'def_win' && <h1 style={{ color: '#4a9eff', textShadow: '0 0 20px #4a9eff' }}>방어!</h1>}
                           {combatVisual.result === 'draw' && <h1 style={{ color: '#888' }}>충돌!</h1>}
                        </div>
                     )}
                     <div className="slot-container" style={{ textAlign: 'center' }}>
                        <div className={`card-slot def-slot ${gameState.slots?.def ? '' : 'empty'} ${combatVisual?.status === 'clashing' ? 'clashing' : ''} ${combatVisual?.status === 'flying' && combatVisual.result === 'def_win' ? 'defending-shield' : ''} ${combatVisual?.status === 'flying' && combatVisual.result === 'draw' ? 'clashing-draw' : ''} ${combatVisual?.status === 'impacted' && (combatVisual.result === 'draw' || combatVisual.result === 'atk_win') ? 'shattering' : ''} ${combatVisual?.status === 'impacted' && combatVisual.result === 'def_win' ? 'flash-gold' : ''} ${(gameState.revealState === 'both') ? 'revealing' : ''}`}
                           onDragOver={e => e.preventDefault()}
                           onDrop={e => {
                              const cardData = JSON.parse(e.dataTransfer.getData("card"));
                              if (cardData.type === 'defense') socket.emit('submit_card', { cardId: cardData.id, type: 'defense', roomId: gameState.id });
                           }}
                        >
                           {gameState.slots?.def && !hideResolvedSlots && (
                              <Card
                                 card={gameState.slots.def.card}
                                 ownerId={gameState.slots.def.ownerId}
                                 displayValue={gameState.slots.def.card.value + (gameState.players[gameState.slots.def.ownerId]?.currentBuffs?.def || 0)}
                                 isBuffed={gameState.players[gameState.slots.def.ownerId]?.currentBuffs?.def > 0}
                                 isFogged={gameState.fieldEvent === 'abyssal_fog' && gameState.slots.def.ownerId !== persistentId}
                                 revealForce={isRevealing || gameState.revealState === 'both'}
                                 onContextMenu={(e) => { e.preventDefault(); setInspectedCard(gameState.slots.def.card); }}
                                 onClick={() => {
                                    if (gameState.slots.def.ownerId === persistentId && !gameState.readyForCombat.includes(persistentId))
                                       socket.emit('recall_card', { type: 'defense', roomId: gameState.id });
                                 }}
                                 style={{
                                    cursor: 'pointer',
                                    outline: gameState.slots.def.ownerId === persistentId ? '2px dashed var(--accent-gold)' : 'none'
                                 }}
                              />
                           )}
                           {gameState.slots?.gaveUp && <div className="forfeit-badge">포기함</div>}
                        </div>
                        <span className="font-gothic" style={{ fontSize: '0.8rem' }}>방어석</span>
                     </div>
                  </div>
               </div>

               {/* SOUTH ZONE (ME) */}
               {renderPlayerZone(persistentId, 'south')}

               {isMergeModalOpen && (
                  <div className="overlay">
                     <div className="popup-box" style={{ width: '80%', maxWidth: '800px' }}>
                        <h2 className="font-gothic text-center">카드 합성</h2>
                        <div className="hand-row" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                           {gameState.players[persistentId]?.hand.filter(c => c.type !== 'effect').map(c => {
                              const isSelected = selectedCards.find(sc => sc.id === c.id);
                              const isDisabled = selectedCards.length > 0 && (selectedCards[0].name !== c.name || selectedCards[0].type !== c.type || selectedCards[0].type === 'effect');
                              return (
                                 <Card
                                    key={c.id}
                                    card={c}
                                    onClick={() => {
                                       if (isDisabled) return;
                                       setSelectedCards(prev => {
                                          const exists = prev.find(p => p.id === c.id);
                                          if (exists) return prev.filter(p => p.id !== c.id);
                                          if (prev.length >= 4) return prev; // Max 4 cards for merge
                                          return [...prev, c];
                                       });
                                    }}
                                    className={isSelected ? 'highlight' : ''}
                                    style={{ opacity: isDisabled ? 0.3 : 1 }}
                                 />
                              );
                           })}
                        </div>
                        <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                           <button className="btn" onClick={() => { setIsMergeModalOpen(false); setSelectedCards([]); }}>Cancel</button>
                           <button className="btn" disabled={selectedCards.length < 2} onClick={() => { socket.emit('merge_cards', selectedCards.map(c => c.id)); setSelectedCards([]); setIsMergeModalOpen(false); }}>Merge</button>
                        </div>
                     </div>
                  </div>
               )}
            </div>
         )}

         {gameState?.phase === 'match_aborted' && (
            <div className="overlay" style={{ flexDirection: 'column', background: 'rgba(0, 0, 0, 0.95)', zIndex: 100000 }}>
               <h1 className="font-gothic" style={{ fontSize: '3rem', color: 'var(--accent-red)', textAlign: 'center' }}>상대가 모두 떠났습니다.</h1>
               <button className="btn" style={{ marginTop: '3rem' }} onClick={() => { setAppState('lobby'); setGameState(null); setRoomId(''); socket.emit('leave_room'); }}>로비로 돌아가기</button>
            </div>
         )}

         <style>{`
.divine-visit-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  z-index: 5000;
  animation: fadeIn 0.5s ease;
}

.divine-announcement {
  margin-bottom: 3rem;
  animation: slideInDown 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.divine-card-container {
  width: 320px;
  height: 480px;
  perspective: 1000px;
  animation: divineSlideAndThump 2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

.divine-card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
}

.divine-card-container.flipped .divine-card-inner {
  transform: rotateY(180deg);
}

.divine-card-back, .divine-card-front {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 4px solid var(--accent-gold);
  box-shadow: 0 0 40px rgba(195, 160, 94, 0.4);
}

.divine-card-back {
  background: linear-gradient(135deg, #111, #222);
  color: var(--accent-gold);
}

.divine-seal {
  font-size: 2rem;
  font-family: var(--font-gothic);
  opacity: 0.5;
  letter-spacing: 5px;
}

.divine-card-front {
  background: #000;
  transform: rotateY(180deg);
}

.divine-card-front-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  clip-path: inset(0 0 100% 0);
  transition: clip-path 1.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.divine-card-container.flipped .divine-card-front-content {
  clip-path: inset(0 0 0 0);
  transition-delay: 0.6s;
}

.invisible-card {
  opacity: 0 !important;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.event-title {
  color: var(--accent-gold);
  font-size: 2.5rem;
  margin-bottom: 2rem;
  text-align: center;
}

.event-desc {
  padding: 0 2rem;
  line-height: 1.6;
  color: #fff;
  opacity: 0.9;
  text-align: center;
}

@keyframes divineSlideAndThump {
  0% {
    transform: translateY(-100vh) scale(0.8);
    opacity: 0;
  }
  40% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  /* First Heartbeat */
  50% {
    transform: translateY(0) scale(1.15);
    box-shadow: 0 0 50px rgba(255, 215, 0, 0.8);
  }
  58% {
    transform: translateY(0) scale(1);
  }
  /* Second Heartbeat */
  66% {
    transform: translateY(0) scale(1.15);
    box-shadow: 0 0 50px rgba(255, 215, 0, 0.8);
  }
  74% {
    transform: translateY(0) scale(1);
  }
  100% {
    transform: translateY(0) scale(1);
  }
}

@keyframes slideInDown {
  from { transform: translateY(-50px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.card-slot {
   transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
   transform-style: preserve-3d;
}

.card-slot.shattering {
  animation: shat-flash 0.5s forwards;
  opacity: 0;
  pointer-events: none;
}

@keyframes deflect-away {
  0% { transform: translate(0, 0) rotate(0deg); }
  100% { transform: translate(-50vw, -100vh) rotate(-720deg); opacity: 0; }
}

.deflected {
  animation: deflect-away 0.6s ease-in forwards;
  pointer-events: none;
}

@keyframes flash-gold-anim {
  0% { box-shadow: 0 0 0px gold; filter: brightness(1); transform: scale(1); }
  50% { box-shadow: 0 0 50px gold; filter: brightness(2); transform: scale(1.1); }
  100% { box-shadow: 0 0 0px gold; filter: brightness(1); transform: scale(1); }
}

.flash-gold {
  animation: flash-gold-anim 0.8s ease-out forwards;
}

.card-slot.revealing {
   animation: slotFlip 0.8s forwards;
}

@keyframes slotFlip {
   0% { transform: rotateY(0deg) scale(1); }
   50% { transform: rotateY(90deg) scale(1.1); }
   100% { transform: rotateY(0deg) scale(1.05); }
}

.stat-boosted {
   color: #ffde10 !important;
   text-shadow: 0 0 10px rgba(255, 222, 16, 0.5);
   font-weight: 900;
}
`}</style>

         {appState === 'victory' && gameState && (
            <div className="overlay" style={{ flexDirection: 'column' }}>
               <h1 className="font-gothic" style={{ fontSize: '8rem', color: gameState.winnerId === persistentId ? 'var(--accent-gold)' : (gameState.winnerId === null ? '#aaa' : 'var(--accent-red)') }}>
                  {gameState.winnerId === persistentId ? '승리' : (gameState.winnerId === null ? '무승부' : '패배')}
               </h1>
               <button className="btn" onClick={() => { setAppState('waiting'); socket.emit('return_to_lobby'); }}>로비로 돌아가기</button>
            </div>
         )}

         {countdown > 0 && <div className="overlay" style={{ zIndex: 2000 }}><h1 className="title-text" style={{ fontSize: '10rem' }}>{countdown}</h1></div>}
         {/* DIVINE VISIT OVERLAY */}
         {divineVisit && (
            <div className="divine-visit-overlay">
               <div className="divine-announcement">
                  <h2 className="font-gothic" style={{ color: 'var(--accent-gold)', textShadow: '0 0 10px gold' }}>🕊️ 성령의 방문</h2>
               </div>
               <div className={`divine-card-container ${divineFlipped ? 'flipped' : ''}`}>
                  <div className="divine-card-inner">
                     <div className="divine-card-back" style={{ background: `url(${divineCardBackImg}) center/cover no-repeat`, border: '2px solid var(--accent-gold)', borderRadius: '12px' }}>
                     </div>
                     <div className="divine-card-front">
                        <div className="divine-card-front-content">
                           <h1 className="font-gothic event-title">{divineVisit.title}</h1>
                           <p className="event-desc">{divineVisit.desc}</p>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* EVENT REVEAL OVERLAY */}
          {revealingEventCards && (() => {
             const env = getEnvironmentDetails(revealingEventCards.event);
             return (
                <div className="event-reveal-overlay">
                   <div className="event-banner-container">
                      <div className="blink-glow" style={{ fontSize: '4.5rem', textShadow: `0 0 25px ${env.color}`, animation: 'floatEffect 3s ease-in-out infinite' }}>
                         {env.icon}
                      </div>
                      <h1 className="font-gothic" style={{ color: env.color, fontSize: '3.5rem', letterSpacing: '4px', textShadow: `0 0 20px ${env.color}`, marginTop: '0.5rem' }}>
                         {env.title}
                      </h1>
                      <p style={{ color: '#ccc', fontSize: '1.1rem', letterSpacing: '1px', marginTop: '0.5rem', opacity: 0.9 }}>
                         {env.desc}
                      </p>
                   </div>
                   <div style={{ display: 'flex', gap: '2.5rem', justifyContent: 'center', width: '100%' }}>
                      {revealingEventCards.cards.map((card, i) => (
                         <div key={i} className="reveal-card-container">
                            <div className={`card-3d-inner ${flippedIndices.includes(i) ? 'flipped' : ''}`}>
                               <div className="card-3d-back" style={{ background: `url(${eventCardBackImg}) center/cover no-repeat`, borderColor: env.color, borderWidth: '2px' }}>
                               </div>
                               <div className="card-3d-front" style={{ borderColor: env.color }}>
                                  <div className="card-header" style={{ fontSize: '0.6rem', color: env.color, position: 'absolute', top: '5px', left: '5px' }}>환경 보상</div>
                                  <div className="card-item-name-mid" style={{ fontSize: '1.2rem', color: '#fff', textShadow: '0 0 5px rgba(255,255,255,0.3)' }}>{card?.name || '신비한 카드'}</div>
                                  <div style={{ fontSize: '0.85rem', color: '#aaa', padding: '0 10px', textAlign: 'center', margin: 'auto 0 20px 0', lineHeight: '1.4' }}>
                                     {card?.desc || '고유한 전장의 기운을 품고 있는 특별한 장비.'}
                                  </div>
                                  <div className="card-value-bottom stat-boosted" style={{ fontSize: '1.8rem', color: 'var(--accent-gold)', bottom: '15px' }}>
                                     {card?.value || 0}
                                  </div>
                               </div>
                            </div>
                         </div>
                      ))}
                   </div>
                </div>
             );
          })()}

         {inspectedHero && (
            <div className="inspect-overlay" onClick={() => setInspectedHero(null)}>
               <div className="inspect-content" onClick={e => e.stopPropagation()}>
                  <div style={{ width: '300px', height: '420px', borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--accent-gold)', background: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                     {inspectedHero.heroClass?.image ? (
                        <img src={inspectedHero.heroClass.image} alt={inspectedHero.heroClass.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                     ) : (
                        <div style={{ fontSize: '8rem' }}>{inspectedHero.heroClass?.icon}</div>
                     )}
                  </div>
                  <div className="inspect-details">
                     <div className="inspect-type" style={{ color: 'var(--accent-gold)' }}>직업</div>
                     <h2>{inspectedHero.heroClass?.name || '알 수 없음'}</h2>
                     <div className="inspect-stat">플레이어: {inspectedHero.player?.name}</div>
                     <div className="inspect-stat">HP: {Math.max(0, inspectedHero.player?.hp || 0)} / 100</div>
                     <div className="inspect-stat">포인트: {inspectedHero.player?.points || 0}</div>
                     <div className="inspect-desc" style={{ marginTop: '1rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
                        <strong style={{ color: 'var(--accent-gold)' }}>⚡ 어빌리티 (5P)</strong><br/>
                        {inspectedHero.heroClass?.desc || '설명 없음'}
                     </div>
                     <button className="btn" style={{ marginTop: '2rem' }} onClick={() => setInspectedHero(null)}>닫기</button>
                  </div>
               </div>
            </div>
         )}

         {inspectedCard && (
            <div className="inspect-overlay" onClick={() => setInspectedCard(null)}>
               <div className="inspect-content" onClick={e => e.stopPropagation()}>
                  <Card card={inspectedCard} revealForce={true} style={{ width: '300px', height: '420px', fontSize: '1.2rem' }} />
                  <div className="inspect-details">
                     <div className="inspect-type" style={{ color: inspectedCard.type === 'attack' ? 'var(--accent-red)' : 'steelblue' }}>{inspectedCard.type === 'attack' ? '공격' : inspectedCard.type === 'defense' ? '방어' : '효과'}</div>
                     <h2>{inspectedCard.name || '알 수 없는 카드'}</h2>
                     <div className="inspect-stat">수치: {inspectedCard.value}</div>
                     <div className="inspect-desc">
                        {inspectedCard.desc || '심연의 깊은 곳에서 발견된 강력한 카드. 그 진정한 본질은 비밀에 쌓여 있다...'}
                     </div>
                     <button className="btn" style={{ marginTop: '2rem' }} onClick={() => setInspectedCard(null)}>닫기</button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );

   function getTargetOffset(targetId) {
      if (!targetId || !gameState) return { x: 0, y: 0 };
      const pos = getPositionData();
      if (pos.north === targetId) return { x: 0, y: -400 };
      if (pos.west === targetId) return { x: -600, y: -200 };
      if (pos.east === targetId) return { x: 600, y: -200 };
      return { x: 0, y: 0 };
   }

   function getPositionData() {
      if (!gameState || !persistentId) return {};
      const turnOrder = gameState.turnOrder;
      let myIdx = turnOrder.indexOf(persistentId);

      // If I'm dead/spectator, use index 0 as base for rotation
      const baseIdx = myIdx === -1 ? 0 : myIdx;
      const rotated = [...turnOrder.slice(baseIdx), ...turnOrder.slice(0, baseIdx)];

      const pos = { south: (gameState.players[persistentId] ? persistentId : null), west: null, north: null, east: null };
      if (rotated.length === 2) {
         pos.north = rotated[1] === persistentId ? null : rotated[1];
      } else if (rotated.length === 3) {
         pos.west = rotated[1] === persistentId ? null : rotated[1];
         pos.north = rotated[2] === persistentId ? null : rotated[2];
      } else if (rotated.length === 4) {
         pos.west = rotated[1] === persistentId ? null : rotated[1];
         pos.north = rotated[2] === persistentId ? null : rotated[2];
         pos.east = rotated[3] === persistentId ? null : rotated[3];
      }
      return pos;
   }

   function renderPlayerZone(id, direction) {
      if (!id) return <div className={`player-area-${direction}`} />;
      const p = gameState.players[id];
      if (!p) return <div className={`player-area-${direction}`} />;
      const isMe = id === persistentId;
      const isActive = gameState.turnOrder[gameState.activeIdx] === id;
      const isTarget = gameState.currentTarget === id;
      const isMeDefender = isMe && isTarget;
      const char = HERO_CLASSES.find(c => c.id === p.heroClass);

      const isMeAttacker = gameState.turnOrder[gameState.activeIdx] === persistentId;

      return (
         <div className={`player-area-${direction} ${shakingPlayerId === id ? 'shaking-unit' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
            <div
               className={`player-profile ${isActive ? 'active' : ''} ${isTarget ? 'targeted' : ''}`}
               onClick={() => !isMe && isMeAttacker && p.hp > 0 && !gameState.isResolving && !gameState.slots?.atk && socket.emit('select_target', { targetId: id, roomId: gameState.id })}
               style={{ position: 'relative', cursor: (!isMe && isMeAttacker && p.hp > 0 && !gameState.isResolving) ? 'pointer' : 'default' }}
            >
               {damageDealt?.playerId === id && <div className="damage-text">-{damageDealt.amount}</div>}

               {/* POINT GAUGE */}
               <div className="points-gauge-outer">
                  <div className="points-gauge-inner" style={{ height: `${(p.points || 0) * 20}%` }}></div>
               </div>

               {/* STATUS EFFECTS & TIMERS */}
               <div className="status-effects-row">
                  {p.statusEffects?.map((eff, i) => (
                     <div key={i} className="status-icon" title={`${eff.type} (${eff.duration} turns)`}>
                        {eff.type === 'bleed' ? '🩸' : (eff.type === 'fire' ? '🔥' : '🧪')}
                     </div>
                  ))}
                  {p.isStunned && <div className="status-icon">💤</div>}
               </div>

               <div className={`char-portrait char-style-${Math.max(0, gameState.turnOrder.indexOf(id))}`}
                  style={{ width: '100px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', filter: p.hp <= 0 ? 'grayscale(1)' : 'none', background: char?.image ? `url(${char.image}) center/cover no-repeat` : 'rgba(0,0,0,0.3)', borderRadius: '50%', border: '2px solid var(--accent-gold)' }}
                  onContextMenu={(e) => { e.preventDefault(); setInspectedHero({ player: p, heroClass: char }); }}
               >
                  {!char?.image && char?.icon}
               </div>

               {/* TURN INDICATOR */}
               {isActive && <div className="turn-indicator attacker" style={{ color: 'var(--accent-gold)', fontSize: '0.8rem', fontWeight: 'bold' }}>공격 중...</div>}
               {isTarget && gameState.phase === 'battle' && <div className="turn-indicator defender" style={{ color: 'var(--accent-red)', fontSize: '0.8rem', fontWeight: 'bold' }}>수비 중...</div>}

               <div className="hp-bar-outer" style={{ width: '100%', height: '8px', background: '#222', marginTop: '5px' }}>
                  <div className="hp-bar-inner" style={{ width: `${Math.max(0, p.hp)}%`, height: '100%', background: p.hp < 30 ? 'red' : 'var(--accent-red)' }}></div>
               </div>
               <div className="font-gothic" style={{ fontSize: '0.8rem', marginTop: '3px' }}>{p.name} ({Math.max(0, p.hp)})</div>
            </div>

            {isMe && (
               <div className="player-controls" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '1.5rem', gap: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                     <button className="btn btn-ability"
                        disabled={gameState.isResolving || p.points < 5 || (!isMeAttacker && !isMeDefender) || (isMeAttacker && !gameState.currentTarget)}
                        onClick={useAbility}>⚡ 어빌리티 사용 (5P)</button>

                     <button className="btn" disabled={gameState.isResolving || (!isMeAttacker && !isMeDefender) || gameState.turnStats?.mergeUsedBy?.[persistentId]} onClick={() => { setSelectedCards([]); setIsMergeModalOpen(true); }}>합성</button>

                     {isMeAttacker && !gameState.slots?.atk && <button className="btn" style={{ borderColor: 'gray' }} disabled={gameState.isResolving} onClick={skipTurn}>🏳️ 공격 포기</button>}

                     {isMeDefender && gameState.defenderPhaseStart && !gameState.slots?.def && !gameState.slots?.gaveUp &&
                        <button className="btn" style={{ color: 'var(--accent-red)' }} disabled={gameState.isResolving} onClick={giveUpDefense}>🏳️ 수비 포기</button>}

                     {isMe && p.hand.length <= 2 && <button className="btn" style={{ color: 'crimson', borderColor: 'crimson' }} disabled={gameState.isResolving || p.hand.length >= 10} onClick={() => {
                        socket.emit('execute_blood_pact', { roomId: gameState.id });
                        setDamageDealt({ playerId: persistentId, amount: 25 });
                        setShakingPlayerId(persistentId);
                        setTimeout(() => {
                           setDamageDealt(null);
                           setShakingPlayerId(null);
                        }, 1500);
                     }}>🩸 피의 계약</button>}
                  </div>
                  <div className="hand-container" style={{ display: 'flex', gap: '0.5rem' }}>
                     {p.hand.map(c => {
                        const canSubmit = !gameState.isResolving && ((isMeAttacker && gameState.currentTarget && (c.type === 'attack' || c.type === 'effect')) ||
                           (isMeDefender && gameState.defenderPhaseStart && c.type === 'defense'));

                        return (
                           <Card
                              key={c.id}
                              card={c}
                              ownerId={id}
                              displayValue={c.type === 'attack' ? c.value + (p.currentBuffs?.atk || 0) : (c.type === 'defense' ? c.value + (p.currentBuffs?.def || 0) : c.value)}
                              isBuffed={(c.type === 'attack' && p.currentBuffs?.atk > 0) || (c.type === 'defense' && p.currentBuffs?.def > 0)}
                              isFogged={false}
                              onContextMenu={(e) => { e.preventDefault(); setInspectedCard(c); }}
                              onClick={() => {
                                 if (!canSubmit) return;
                                 socket.emit('submit_card', { cardId: c.id, type: c.type, roomId: gameState.id });
                              }}
                              draggable={canSubmit}
                              onDragStart={e => canSubmit && e.dataTransfer.setData("card", JSON.stringify(c))}
                              style={{ opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
                           />
                        );
                     })}
                  </div>
               </div>
            )}
         </div>
      );
   }
}

function Card({ card, ownerId, onClick, onContextMenu, className, style, revealForce, isFogged, ...props }) {
   const color = card.type === 'attack' ? 'var(--accent-red)' : (card.type === 'defense' ? 'steelblue' : 'var(--accent-gold)');
   const isMasked = (card.isMasked || isFogged) && !revealForce;

   const displayValue = props.displayValue || card.value;
   const isStatIncreased = props.isBuffed || (card.mergeCount > 1);

   if (isMasked) return <div className={`card ${className || ''}`} style={{ ...style, borderColor: '#444' }} onContextMenu={onContextMenu}><div className="card-back-v"></div></div>;

   return (
      <div className={`card card-bg-${card.type} ${card.mergeCount > 1 ? 'merged' : ''} ${className || ''}`} data-merge={`+${card.mergeCount}`}
         onClick={onClick} onContextMenu={onContextMenu} draggable={props.draggable} onDragStart={props.onDragStart} style={{ ...style, borderColor: color }}>
         <div className="card-header" style={{ fontSize: '0.6rem', color: color, position: 'absolute', top: '5px', left: '5px' }}>{card.type === 'attack' ? '공격' : card.type === 'defense' ? '방어' : '효과'}</div>
         <div className="card-item-name-mid">{card.name}</div>
         <div className={`card-value-bottom ${isStatIncreased ? 'stat-boosted' : ''}`} style={{ color: !isStatIncreased ? color : 'inherit' }}>
            {displayValue}
         </div>
      </div>
   )
}
