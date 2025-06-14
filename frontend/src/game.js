// frontend/src/game.js

import { ensureAuth }       from './ui.js';
import { io }               from 'socket.io-client';
import { initCanvas }       from './game/canvas.js';
import { initTokenManager } from './game/tokenManager.js';
import { initUIControls }   from './game/uiControls.js';
import { initChat }         from './chat.js';    // НЕ ТРОГАЕМ
import { initVoice }        from './voice.js';
import { initDice }         from './dice.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1) Авторизация + Socket.IO
  ensureAuth();
  const token   = localStorage.getItem('jwt');
  const socket  = io({ auth: { token }, path: '/socket.io' });
  const params  = new URLSearchParams(window.location.search);
  const lobbyId = Number(params.get('lobbyId'));
  if (!Number.isInteger(lobbyId)) {
    console.error('Неверный lobbyId');
    return;
  }
  let isMaster = false;

  // 1.1) Заходим в комнату
  socket.once('connect', () => {
    socket.emit('joinLobby', { lobbyId }, res => {
      if (res?.error) console.error('joinLobby:', res.error);
      else {
        const payload = JSON.parse(atob(token.split('.')[1]));
        isMaster = payload.userId === res.masterId;
        if (!isMaster) {
          const c = document.getElementById('mapControls');
          if (c) c.style.display = 'none';
        }
      }
    });
  });

  // 2) Canvas
  const canvasEl = document.getElementById('gameBoard');
  if (!canvasEl) {
    console.error('Не найден <canvas id="gameBoard">');
    return;
  }
  const canvasAPI = initCanvas(canvasEl);
  canvasAPI.onTokenMove(tok => {
    socket.emit('moveToken', { lobbyId, id: tok.id, x: tok.x, y: tok.y }, () => {});
  });
  canvasAPI.onStrokeEnd(stroke => {
    socket.emit('drawStroke', { lobbyId, color: stroke.color, width: stroke.width, points: stroke.points }, res => {
      if (res?.error) console.error('drawStroke', res.error);
    });
  });

  // 3) Token Manager + UI Controls
  const tokenManager = initTokenManager({
    gallery:        document.getElementById('tokenGallery'),
    categorySelect: document.getElementById('tokenCategory'),
    sizeSelect:     document.getElementById('tokenSize'),
    socket,
    lobbyId,
    canvasAPI
  });
  initUIControls({
    deleteTokenBtn:     document.getElementById('deleteToken'),
    clearBoardBtn:      document.getElementById('clearBoard'),
    tokenSizeSelect:    document.getElementById('tokenSize'),
    tokenCategorySelect:document.getElementById('tokenCategory'),
    tokenGallery:       document.getElementById('tokenGallery'),
    tokenManager,
    canvas:             canvasEl,
    canvasAPI,
    socket,
    lobbyId,
    pointerTool:     document.getElementById('pointerTool'),
    brushTool:        document.getElementById('brushTool'),
    eraserTool:       document.getElementById('eraserTool'),
    drawColorInput:   document.getElementById('drawColor'),
    brushSizeInput:   document.getElementById('brushSize'),
    undoDrawBtn:      document.getElementById('undoDraw'),
    redoDrawBtn:      document.getElementById('redoDraw')
  });

  const mapFile   = document.getElementById('mapFile');
  const uploadMap = document.getElementById('uploadMap');
  const mapList   = document.getElementById('mapList');

  if (uploadMap && mapFile) {
    uploadMap.addEventListener('click', () => {
      if (!isMaster) return;
      mapFile.click();
    });

    mapFile.addEventListener('change', () => {
      if (!isMaster) return;
      const file = mapFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        const arr = Array.from(new Uint8Array(e.target.result));
        socket.emit('uploadMap', { lobbyId, fileName: file.name, mimeType: file.type, fileBuffer: arr }, res => {
          if (res?.error) console.error('uploadMap', res.error);
        });
      };
      reader.readAsArrayBuffer(file);
      mapFile.value = '';
    });
  }

  socket.emit('getGameState', { lobbyId }, state => {
    if (state && !state.error) {
      state.maps?.forEach(m => {
        canvasAPI.addMapWorld(m.url, m.id, m.x || 0, m.y || 0, m.scale || 1);
        addMapToList(m);
      });
      state.placedTokens.forEach(p => {
        canvasAPI.addTokenWorld(p.x, p.y, p.color || '#000', p.radius || 20, p.resourceId, p.id);
      });
      state.strokes?.forEach(s => {
        canvasAPI.addStrokeWorld(s);
      });
    } else if (state?.error) {
      console.error('getGameState', state.error);
    }
  });

  // 4) ВАЖНО: оборачиваем socket только для chat.js
  const chatBox   = document.getElementById('chatBox');
  const chatInput = document.getElementById('chatInput');
  const sendBtn   = document.getElementById('sendBtn');

  const chatSocket = {
    // всё, что слушаем — прокидываем
    on:  (evt, cb)   => socket.on(evt, cb),
    once:(evt, cb)   => socket.once(evt, cb),
    // emit — перехватываем только getChatHistory
    emit: (evt, data, ack) => {
      if (evt === 'getChatHistory') {
        // вместо несуществующего WS-эвента — HTTP-fetch
        fetch(`/api/lobby/${lobbyId}/chat`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
        .then(msgs => ack({ messages: msgs, error: null }))
        .catch(err => {
          console.error('fetch history failed:', err);
          ack({ messages: [], error: err.toString() });
        });
      } else {
        // всё остальное — штатно
        socket.emit(evt, data, ack);
      }
    }
  };

  // 5) Инициализируем чат — chat.js не трогаем
  initChat(
    chatSocket,
    lobbyId,
    chatBox,
    chatInput,
    sendBtn
  );

  // 6) Кубики
  initDice(
    socket,
    lobbyId,
    document.getElementById('diceType'),
    document.getElementById('diceCount'),
    document.getElementById('rollDice')
  );

  // 7) Голосовой чат
  initVoice(
    document.getElementById('voiceBtn'),
    socket,
    lobbyId
  );

  socket.on('tokenPlaced', (tok) => {
    canvasAPI.addTokenWorld(tok.x, tok.y, tok.color || '#000', tok.radius || 20, tok.resourceId, tok.id);
  });
  socket.on('tokenMoved', (tok) => {
    canvasAPI.updateTokenPosition(tok.id, tok.x, tok.y);
  });
  socket.on('tokenRemoved', ({ id }) => {
    canvasAPI.removeToken(id);
  });

  socket.on('strokeDrawn', (stroke) => {
    canvasAPI.addStrokeWorld(stroke);
  });
  socket.on('strokeRemoved', ({ id }) => {
    canvasAPI.removeStroke(id);
  });

  socket.on('mapUploaded', (map) => {
    canvasAPI.addMapWorld(map.url, map.id, map.x || 0, map.y || 0, map.scale || 1);
    addMapToList(map);
  });
  socket.on('mapRemoved', ({ id }) => {
    canvasAPI.removeMap(id);
    removeMapFromList(id);
  });
  socket.on('mapUpdated', (m) => {
    canvasAPI.updateMapTransform(m.id, m.x, m.y, m.scale);
    updateMapListItem(m);
  });

  // 8) Старт игры
  socket.on('gameStarted', ({ lobbyId: id }) => {
    if (id === lobbyId) {
      console.log('Game started!');
      // тут можно переключить интерфейс в режим самой игры
    }
  });

  function addMapToList(map) {
    if (!mapList) return;
    const div = document.createElement('div');
    div.dataset.id = map.id;
    div.textContent = map.name || 'map';
    const scaleInput = document.createElement('input');
    scaleInput.type = 'number';
    scaleInput.step = '0.1';
    scaleInput.min = '0.1';
    scaleInput.value = map.scale || 1;
    scaleInput.addEventListener('change', () => {
      const val = parseFloat(scaleInput.value);
      socket.emit('updateMap', { lobbyId, id: map.id, scale: val }, res => {
        if (res?.error) console.error('updateMap', res.error);
      });
    });
    div.appendChild(scaleInput);
    if (isMaster) {
      const rm = document.createElement('button');
      rm.textContent = 'Удалить';
      rm.addEventListener('click', () => {
        socket.emit('removeMap', { lobbyId, id: map.id }, res => {
          if (res?.error) console.error('removeMap', res.error);
        });
      });
      div.appendChild(rm);
    }
    mapList.appendChild(div);
  }

  function removeMapFromList(id) {
    if (!mapList) return;
    const el = mapList.querySelector(`div[data-id="${id}"]`);
    if (el) el.remove();
  }

  function updateMapListItem(map) {
    if (!mapList) return;
    const el = mapList.querySelector(`div[data-id="${map.id}"] input`);
    if (el) el.value = map.scale;
  }
});
