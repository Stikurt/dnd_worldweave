let selectedImage = null;
let galleryElement = null;

export function initTokenGallery(galleryElementRef) {
  galleryElement = galleryElementRef;

  galleryElement.addEventListener("click", (e) => {
    if (e.target.tagName.toLowerCase() === "img") {
      selectImage(e.target);
    }
  });
}

export function loadTokenImages(category) {
  if (!galleryElement) return;

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

  selectedImage = null;
}

function selectImage(img) {
  galleryElement.querySelectorAll("img").forEach((el) => el.classList.remove("selected"));
  img.classList.add("selected");
  selectedImage = img;
}

export function getSelectedImage() {
  return selectedImage;
}

export function resetSelection() {
  galleryElement.querySelectorAll("img").forEach((el) => el.classList.remove("selected"));
  selectedImage = null;
}
