// formatear precios en COP
const formatCOP = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(value);

function getCart() {
  try {
    const raw = localStorage.getItem("cart");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(cart));
}

function updateCartCount() {
  const cart = getCart();
  const count = cart.length;
  const span = document.getElementById("cart-count");
  if (span) span.textContent = count;
}

function renderCart() {
  const cart = getCart();
  const container = document.getElementById("cart-items");
  const emptyMsg = document.getElementById("cart-empty");
  const totalItemsEl = document.getElementById("cart-total-items");
  const totalAmountEl = document.getElementById("cart-total-amount");

  if (!container) return;

  container.innerHTML = "";

  if (!cart.length) {
    if (emptyMsg) emptyMsg.style.display = "block";
    if (totalItemsEl) totalItemsEl.textContent = "0";
    if (totalAmountEl) totalAmountEl.textContent = formatCOP(0);
    return;
  }

  if (emptyMsg) emptyMsg.style.display = "none";

  let totalAmount = 0;

  cart.forEach((item) => {
    totalAmount += item.price;

    const row = document.createElement("div");
    row.className = "cart-item";

    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.6rem;">
        <img src="${item.image_url}" alt="${item.name}" class="cart-item-image" />
        <span>${item.name}</span>
      </div>
      <div style="display:flex; align-items:center; gap:0.6rem;">
        <span>${formatCOP(item.price)}</span>
        <button class="btn-secondary btn-remove" data-id="${item.id}">
          Eliminar
        </button>
      </div>
    `;

    container.appendChild(row);
  });

  if (totalItemsEl) totalItemsEl.textContent = String(cart.length);
  if (totalAmountEl) totalAmountEl.textContent = formatCOP(totalAmount);

  // listeners para eliminar
  container.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.getAttribute("data-id"), 10);
      const newCart = getCart().filter((item) => item.id !== id);
      saveCart(newCart);
      updateCartCount();
      renderCart();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const clearBtn = document.getElementById("clear-cart");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (confirm("¿Seguro que quieres vaciar todo el carrito?")) {
        saveCart([]);
        updateCartCount();
        renderCart();
      }
    });
  }

  updateCartCount();
  renderCart();
});
