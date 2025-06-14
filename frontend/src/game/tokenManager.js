import { addToken as addCanvasToken } from "./canvas.js";

let selectedImage = null;
let isAddingToken = false;
let galleryElement = null;
let ws = null;
let lobby = null;

export function initTokenManager({
  gallery,
  categorySelect,
  sizeSelect,
  socket,
  lobbyId,
}) {
  galleryElement = gallery;
  ws = socket;
  lobby = lobbyId;

  categorySelect.addEventListener("change", () => {
    loadTokenImages(categorySelect.value);
  });

  loadTokenImages(categorySelect.value);

  galleryElement.addEventListener("click", (e) => {
    if (e.target.tagName.toLowerCase() === "img") {
      galleryElement.querySelectorAll("img").forEach((img) => img.classList.remove("selected"));
      e.target.classList.add("selected");
      selectedImage = e.target;
      isAddingToken = true;
    }
  });

  return {
    isAddingToken: () => isAddingToken,
    finalizeToken: () => {
      selectedImage = null;
      isAddingToken = false;
      galleryElement.querySelectorAll("img").forEach((img) => img.classList.remove("selected"));
    },
    createTokenAt: (x, y) => {
      const defaultColor = "#000"; // Используем чёрный по умолчанию вместо отсутствующего селектора цвета
      const radius = parseInt(sizeSelect.value, 10);
      const token = addCanvasToken(x, y, defaultColor, radius, selectedImage);
      if (ws) {
        ws.emit(
          "placeToken",
          { lobbyId: lobby, resourceId: selectedImage?.title || "local", x: token.x, y: token.y },
          (res) => {
            if (!res?.error) {
              token.id = res.placement.id;
            }
          }
        );
      }
    },
  };
}

function loadTokenImages(category) {
  galleryElement.innerHTML = "";
  const folderPath = `public/assets/tokens/${category}/`;

  for (let i = 1; i <= 20; i++) {
    const img = new Image();
    img.src = `${folderPath}${i}.png`;
    img.classList.add("token-thumbnail");
    img.title = `${i}.png`;
    img.onerror = () => {}; // игнорировать ошибки
    img.onload = () => galleryElement.appendChild(img);
  }
}
