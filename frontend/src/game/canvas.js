let canvas, ctx;
let baseCellSize = 30;
let scale = 1;
let offsetX = 0,
  offsetY = 0;
let isDragging = false,
  startX,
  startY;
let selectedToken = null;
let movingToken = null;
let tokens = [];
let maps = [];
let moveCb = null;

function setDrawingMode(val) { drawing = val; }
function setBrushColor(c) { drawColor = c; }
function setBrushSize(s) { brushSize = s; }
function setEraser(val) { eraser = val; }
function onStrokeEnd(cb) { strokeEndCb = cb; }
let drawing = false;
let currentStroke = null;
let strokes = [];
let strokeEndCb = null;
let drawColor = '#ff0000';
let brushSize = 4;
let eraser = false;

export function initCanvas(canvasElement) {
  canvas = canvasElement;
  ctx = canvas.getContext("2d");

  window.addEventListener("resize", resizeCanvas);
  canvas.addEventListener("wheel", handleZoom);
  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  resizeCanvas();

  // Возвращаем API для UI-контролов
  return {
    addToken,
    addTokenWorld,
    removeToken,
    removeSelectedToken,
    clearBoard,
    setTokens,
    getSelectedToken,
    getTokens,
    setSelectedToken,
    updateTokenPosition,
    screenToWorld,
    onTokenMove,
    addMapWorld,
    removeMap,
    updateMapTransform,
    setDrawingMode,
    setBrushColor,
    setBrushSize,
    setEraser,
    onStrokeEnd,
    addStrokeWorld,
    removeStroke,
  };
}

export function setTokens(newTokens) {
  tokens = newTokens;
  draw();
}

export function getSelectedToken() {
  return selectedToken;
}

export function setSelectedToken(token) {
  selectedToken = token;
  draw();
}

export function removeSelectedToken() {
  if (!selectedToken) return;
  removeToken(selectedToken.id);
}

export function clearBoard() {
  tokens.length = 0;
  selectedToken = null;
  draw();
}

export function screenToWorld(screenX, screenY) {
  return {
    x: (screenX - offsetX) / scale,
    y: (screenY - offsetY) / scale,
  };
}

export function addTokenWorld(x, y, color, radius, imageSrc = null, id) {
  const token = { id, x, y, color, radius, image: null };
  if (imageSrc) {
    const img = new Image();
    img.src = imageSrc;
    token.image = img;
    img.onload = draw;
  }
  tokens.push(token);
  draw();
  return token;
}

export function addToken(screenX, screenY, color, radius, imageEl = null, id) {
  const { x, y } = screenToWorld(screenX, screenY);
  const src = imageEl?.src;
  return addTokenWorld(x, y, color, radius, src, id);
}

export function updateTokenPosition(id, x, y) {
  const tok = tokens.find((t) => t.id === id);
  if (tok) {
    tok.x = x;
    tok.y = y;
    draw();
  }
}

export function removeToken(id) {
  tokens = tokens.filter((t) => t.id !== id);
  if (selectedToken && selectedToken.id === id) selectedToken = null;
  draw();
}

export function getTokens() {
  return tokens;
}

export function onTokenMove(cb) {
  moveCb = cb;
}

// === Map helpers ===
export function addMapWorld(url, id, x = 0, y = 0, mapScale = 1) {
  const img = new Image();
  const map = { id, x, y, scale: mapScale, image: img };
  img.src = url;
  img.onload = draw;
  maps.push(map);
  draw();
  return map;
}

export function updateMapTransform(id, x, y, mapScale) {
  const m = maps.find((mm) => mm.id === id);
  if (!m) return;
  if (typeof x === 'number') m.x = x;
  if (typeof y === 'number') m.y = y;
  if (typeof mapScale === 'number') m.scale = mapScale;
  draw();
}

export function removeMap(id) {
  maps = maps.filter((m) => m.id !== id);
  draw();
}

export function getMaps() {
  return maps;
}

export function addStrokeWorld(stroke) {
  strokes.push(stroke);
  draw();
}

export function removeStroke(id) {
  strokes = strokes.filter(s => s.id !== id);
  draw();
}

// === Internal helpers ===

function resizeCanvas() {
  canvas.width = window.innerWidth * 0.7;
  canvas.height = window.innerHeight * 0.8;
  draw();
}

function handleZoom(event) {
  event.preventDefault();
  const zoomFactor = 1.1;
  const mouseX = (event.offsetX - offsetX) / scale;
  const mouseY = (event.offsetY - offsetY) / scale;
  const newScaleUnclamped = event.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor;
  const minScale = 0.2;
  const maxScale = 5;
  const newScale = Math.min(maxScale, Math.max(minScale, newScaleUnclamped));
  offsetX = event.offsetX - mouseX * newScale;
  offsetY = event.offsetY - mouseY * newScale;
  scale = newScale;
  draw();
}

function handleMouseDown(event) {
  if (event.button === 2) {
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    return;
  }

  const { x, y } = getMousePos(event);

  if (drawing) {
    currentStroke = { color: eraser ? '#ffffff' : drawColor, width: brushSize, points: [{ x, y }] };
    draw();
    return;
  }

  selectedToken = null;
  movingToken = null;

  for (let token of tokens) {
    const dist = Math.hypot(x - token.x, y - token.y);
    if (dist < token.radius) {
      selectedToken = token;
      movingToken = token;
      token.dragOffsetX = x - token.x;
      token.dragOffsetY = y - token.y;
      break;
    }
  }

  draw();
}

function handleMouseMove(event) {
  if (isDragging) {
    offsetX += event.clientX - startX;
    offsetY += event.clientY - startY;
    startX = event.clientX;
    startY = event.clientY;
    draw();
    return;
  }

  if (currentStroke) {
    const { x, y } = getMousePos(event);
    currentStroke.points.push({ x, y });
    draw();
    return;
  }

  if (!movingToken) return;
  const { x, y } = getMousePos(event);
  movingToken.x = x - movingToken.dragOffsetX;
  movingToken.y = y - movingToken.dragOffsetY;
  draw();
}

function handleMouseUp() {
  isDragging = false;
  if (currentStroke) {
    const finished = currentStroke;
    currentStroke = null;
    strokeEndCb && strokeEndCb(finished);
    draw();
    return;
  }
  if (movingToken) {
    moveCb && moveCb(movingToken);
  }
  movingToken = null;
}

function getMousePos(event) {
  return {
    x: (event.offsetX - offsetX) / scale,
    y: (event.offsetY - offsetY) / scale,
  };
}

function draw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMaps();
  drawGrid();
  drawStrokes();
  drawTokens();
}

function drawGrid() {
  const cellSize = baseCellSize * scale;
  const xOffset = ((offsetX % cellSize) + cellSize) % cellSize;
  const yOffset = ((offsetY % cellSize) + cellSize) % cellSize;

  ctx.save();
  ctx.strokeStyle = "#bbb";
  ctx.lineWidth = 1;

  for (let x = xOffset; x <= canvas.width; x += cellSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = yOffset; y <= canvas.height; y += cellSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawStrokes() {
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokes.forEach((s) => {
    if (!s.points.length) return;
    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x, s.points[i].y);
    }
    ctx.stroke();
  });
  if (currentStroke) {
    ctx.beginPath();
    ctx.strokeStyle = currentStroke.color;
    ctx.lineWidth = currentStroke.width;
    ctx.moveTo(currentStroke.points[0].x, currentStroke.points[0].y);
    for (let i = 1; i < currentStroke.points.length; i++) {
      ctx.lineTo(currentStroke.points[i].x, currentStroke.points[i].y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawTokens() {
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  tokens.forEach((token) => {
    ctx.save();
    ctx.beginPath();
    if (token.image) {
      ctx.drawImage(
        token.image,
        token.x - token.radius,
        token.y - token.radius,
        token.radius * 2,
        token.radius * 2
      );
      if (token === selectedToken) {
        ctx.beginPath();
        ctx.arc(token.x, token.y, token.radius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    } else {
      ctx.arc(token.x, token.y, token.radius, 0, Math.PI * 2);
      ctx.fillStyle = token.color;
      ctx.fill();
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.stroke();
      if (token === selectedToken) {
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    ctx.restore();
  });

  ctx.restore();
}

function drawMaps() {
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  maps.forEach((m) => {
    if (m.image.complete) {
      ctx.drawImage(m.image, m.x, m.y, m.image.width * m.scale, m.image.height * m.scale);
    }
  });
  ctx.restore();
}