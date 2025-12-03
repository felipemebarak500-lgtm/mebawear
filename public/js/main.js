// =========================
//   UTILIDADES
// =========================

const formatCOP = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(value);

let selectedProduct = null;
let selectedButton = null;

// =========================
//   CARGAR USUARIO
// =========================

async function loadUser() {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) return;
    const user = await res.json();

    const welcome = document.querySelector(".welcome-text");
    if (welcome && user.username) {
      welcome.textContent = `Bienvenido, ${user.username}`;
    }
  } catch (e) {
    console.error("Error cargando usuario:", e);
  }
}

// =========================
//   CARGAR PRODUCTOS
// =========================

async function loadProducts(category = "") {
  try {
    const url = category
      ? `/api/products?category=${encodeURIComponent(category)}`
      : "/api/products";

    const res = await fetch(url);
    const products = await res.json();

    const grid = document.querySelector(".products-grid");
    if (!grid) return;

    grid.innerHTML = "";

    if (!products || products.length === 0) {
      const msg = document.createElement("p");
      msg.className = "no-products";
      msg.textContent = "No hay productos disponibles en esta categoría.";
      grid.appendChild(msg);
      return;
    }

    products.forEach((product) => {
      const card = document.createElement("article");
      card.className = "product-card";

      card.innerHTML = `
        <div class="product-image-wrapper">
          <img src="${product.image_url}" alt="${product.name}" class="product-image" />
        </div>
        <div class="product-info">
          <h2 class="product-title">${product.name}</h2>
          <p class="product-description">${product.description}</p>
          <p class="product-price">${formatCOP(product.price)}</p>
          <button class="btn-primary" data-id="${product.id}">
            Comprar ahora
          </button>
        </div>
      `;

      grid.appendChild(card);
    });

    // listeners de botones
    grid.querySelectorAll(".btn-primary").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.getAttribute("data-id"), 10);
        const product = products.find((p) => p.id === id);
        if (product) openConfirmPopup(product, btn);
      });
    });
  } catch (e) {
    console.error("Error cargando productos:", e);
  }
}

// =========================
//   POPUPS
// =========================

function openConfirmPopup(product, button) {
  selectedProduct = product;
  selectedButton = button;

  const popup = document.getElementById("purchase-popup-confirm");
  const text = document.getElementById("popup-confirm-text");
  if (!popup || !text) return;

  text.textContent = `¿Confirmas la compra de "${product.name}"? Esta es una pieza de edición limitada.`;
  popup.classList.remove("hidden");
}

function closeConfirmPopup() {
  const popup = document.getElementById("purchase-popup-confirm");
  if (popup) popup.classList.add("hidden");
}

function openThanksPopup() {
  const popup = document.getElementById("purchase-popup-thanks");
  if (popup) popup.classList.remove("hidden");
}

function closeThanksPopup() {
  const popup = document.getElementById("purchase-popup-thanks");
  if (popup) popup.classList.add("hidden");
}

// =========================
//   ACCIONES POPUP
// =========================

function setupPopupActions() {
  const btnYes = document.getElementById("popup-confirm-yes");
  const btnNo = document.getElementById("popup-confirm-no");
  const btnThanksOk = document.getElementById("popup-thanks-ok");

  if (btnNo) {
    btnNo.addEventListener("click", () => {
      closeConfirmPopup();
      selectedProduct = null;
      selectedButton = null;
    });
  }

  if (btnYes) {
    btnYes.addEventListener("click", async () => {
      if (!selectedProduct) return;

      closeConfirmPopup();

      // Llamada al backend para registrar la compra y enviar correo
      try {
        await fetch("/api/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: selectedProduct.id }),
        });
      } catch (e) {
        console.error("Error registrando compra:", e);
      }

      // Deshabilitar producto en la UI
      if (selectedButton) {
        selectedButton.disabled = true;
        selectedButton.textContent = "Agotado";
        selectedButton.classList.add("btn-disabled");

        const card = selectedButton.closest(".product-card");
        if (card) {
          card.classList.add("product-card-disabled");
        }
      }

      openThanksPopup();
      selectedProduct = null;
      selectedButton = null;
    });
  }

  if (btnThanksOk) {
    btnThanksOk.addEventListener("click", () => {
      closeThanksPopup();
    });
  }
}

// =========================
//   FILTROS CATEGORÍA
// =========================

function setupCategoryFilters() {
  const links = document.querySelectorAll(".category-list a");
  if (!links.length) return;

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      links.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      const category = link.dataset.category || "";
      loadProducts(category);
    });
  });
}

// =========================
//   INIT
// =========================

document.addEventListener("DOMContentLoaded", () => {
  loadUser();
  setupCategoryFilters();
  setupPopupActions();
  loadProducts();
});
