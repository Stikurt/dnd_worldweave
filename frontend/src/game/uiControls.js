export function initUIControls({
  deleteTokenBtn,
  clearBoardBtn,
  tokenSizeSelect,
  tokenCategorySelect,
  tokenGallery,
  tokenManager,
  canvas,
  canvasAPI,
  socket,
  lobbyId,
}) {
  console.log("initUIControls initialized", { deleteTokenBtn, clearBoardBtn, canvasAPI, tokenManager });

  // Удалить выбранный токен
  deleteTokenBtn.addEventListener("click", () => {
    console.log("Delete button clicked");
    if (!canvasAPI || typeof canvasAPI.getSelectedToken !== "function") return;
    const tok = canvasAPI.getSelectedToken();
    if (!tok) return;
    socket.emit("removeToken", { lobbyId, id: tok.id }, (res) => {
      if (res?.error) {
        console.error("removeToken", res.error);
      } else {
        canvasAPI.removeToken(tok.id);
      }
    });
  });

  // Очистить доску
  clearBoardBtn.addEventListener("click", () => {
    console.log("Clear Board button clicked");
    if (!canvasAPI || typeof canvasAPI.getTokens !== "function") return;
    canvasAPI.getTokens().forEach((t) => {
      socket.emit("removeToken", { lobbyId, id: t.id }, () => {});
    });
    canvasAPI.clearBoard();
  });

  // Смена размера токена
  tokenSizeSelect.addEventListener("change", () => {
    console.log("Size changed to", tokenSizeSelect.value);
    if (typeof tokenManager.setSize === "function") {
      tokenManager.setSize(parseInt(tokenSizeSelect.value, 10));
    }
  });

  // Смена категории токенов (обновление галереи)
  tokenCategorySelect.addEventListener("change", () => {
    console.log("Category changed to", tokenCategorySelect.value);
    if (typeof tokenManager.loadCategory === "function") {
      tokenManager.loadCategory(tokenCategorySelect.value);
    }
  });

  // Выбор изображения из галереи
  tokenGallery.addEventListener("click", (e) => {
    e.stopPropagation();
    const img = e.target.closest("img");
    if (!img) return;
    console.log("Gallery image selected", img.src);
    if (typeof tokenManager.startAddingToken === "function") {
      tokenManager.startAddingToken();
    }
    if (typeof tokenManager.setImage === "function") {
      tokenManager.setImage(img.src);
    }
  });

  // Добавление токена при клике на холсте
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    console.log("Canvas clicked at", screenX, screenY, "adding?", tokenManager.isAddingToken());
    if (tokenManager.isAddingToken()) {
      tokenManager.createTokenAt(screenX, screenY);
      tokenManager.finalizeToken();
    }
  });
}
