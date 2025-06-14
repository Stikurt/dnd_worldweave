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
let moveCb = null;

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

  if (!movingToken) return;
  const { x, y } = getMousePos(event);
  movingToken.x = x - movingToken.dragOffsetX;
  movingToken.y = y - movingToken.dragOffsetY;
  draw();
}

function handleMouseUp() {
  isDragging = false;
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
  drawGrid();
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