

let selectedImage = null;
let isAddingToken = false;
let galleryElement = null;

export function initTokenManager({
  gallery,
  categorySelect,
  sizeSelect,
  socket,
  lobbyId,
  canvasAPI,
}) {
  galleryElement = gallery;

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
    startAddingToken: () => { isAddingToken = true; },
    setImage: src => { selectedImage = new Image(); selectedImage.src = src; },
    finalizeToken: () => {
      selectedImage = null;
      isAddingToken = false;
      galleryElement.querySelectorAll("img").forEach((img) => img.classList.remove("selected"));
    },
    createTokenAt: (x, y) => {
      const defaultColor = "#000"; // Используем чёрный по умолчанию вместо отсутствующего селектора цвета
      const radius = parseInt(sizeSelect.value, 10);
      const { x: boardX, y: boardY } = canvasAPI.screenToWorld(x, y);
      socket.emit(
        "placeToken",
        {
          lobbyId,
          resourceId: selectedImage?.src,
          x: boardX,
          y: boardY,
          radius,
          color: defaultColor,
        },
        (res) => {
          if (res?.error) {
            console.error("placeToken", res.error);
          }
        }
      );
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
