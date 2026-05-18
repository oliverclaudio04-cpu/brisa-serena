const SUPABASE_URL = "https://unmnhrmghejjjtpjlman.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubW5ocm1naGVqamp0cGpsbWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDY1MjEsImV4cCI6MjA5NDYyMjUyMX0.S4cnJCueX9FUdg0zZ3wbrqfh7vSIQVuzvBzDBmnlHqw";

// Exemplo:
// https://SEU-PROJETO.supabase.co/functions/v1/create-checkout
const PAYMENT_FUNCTION_URL = "https://unmnhrmghejjjtpjlman.supabase.co/functions/v1/create-checkout";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let products = [];
let cart = JSON.parse(localStorage.getItem("brisaCart")) || [];
let currentUser = null;
let isAdmin = false;

function formatPrice(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function saveCart() {
  localStorage.setItem("brisaCart", JSON.stringify(cart));
}

async function init() {
  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;

  if (currentUser) {
    await checkAdminPermission();
  }

  await loadProducts();
  renderCart();
  updateAdminUI();
}

async function loadProducts() {
  const grid = document.getElementById("productsGrid");
  grid.innerHTML = "<p>Carregando produtos...</p>";

  const { data, error } = await supabaseClient
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    grid.innerHTML = `<p>Erro ao carregar produtos: ${error.message}</p>`;
    return;
  }

  products = data || [];
  renderProducts();
  renderAdminProducts();
}

function renderProducts() {
  const grid = document.getElementById("productsGrid");
  const search = document.getElementById("searchInput").value.toLowerCase();
  const category = document.getElementById("categoryFilter").value;

  const filtered = products.filter(product => {
    const matchesSearch =
      product.name.toLowerCase().includes(search) ||
      product.description.toLowerCase().includes(search);

    const matchesCategory = category === "todos" || product.category === category;

    return matchesSearch && matchesCategory;
  });

  if (!filtered.length) {
    grid.innerHTML = "<p>Nenhum produto encontrado.</p>";
    return;
  }

  grid.innerHTML = filtered.map(product => `
    <article class="product-card">
      <img
        src="${product.image}"
        alt="${product.name}"
        onerror="this.src='https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=80'"
      />

      <div class="product-info">
        <div class="product-top">
          <h3>${product.name}</h3>
          <span class="tag">${product.category}</span>
        </div>

        <p class="description">${product.description}</p>

        <div class="price-row">
          <span class="price">${formatPrice(product.price)}</span>
          <button
            class="buy-btn"
            ${product.stock <= 0 ? "disabled" : ""}
            onclick="addToCart('${product.id}')"
          >
            ${product.stock <= 0 ? "Esgotado" : "Comprar"}
          </button>
        </div>

        <div class="stock">Estoque: ${product.stock} unidade(s)</div>
      </div>
    </article>
  `).join("");
}

function addToCart(id) {
  const product = products.find(item => item.id === id);

  if (!product || product.stock <= 0) {
    alert("Produto sem estoque.");
    return;
  }

  const existingItem = cart.find(item => item.id === id);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.image,
      quantity: 1
    });
  }

  saveCart();
  renderCart();
  openCart();
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
  renderCart();
}

function renderCart() {
  const cartItems = document.getElementById("cartItems");
  const cartCount = document.getElementById("cartCount");
  const cartTotal = document.getElementById("cartTotal");

  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  cartCount.textContent = totalQuantity;
  cartTotal.textContent = `Total: ${formatPrice(total)}`;

  if (!cart.length) {
    cartItems.innerHTML = "<p>Seu carrinho está vazio.</p>";
    return;
  }

  cartItems.innerHTML = cart.map(item => `
    <div class="cart-item">
      <strong>${item.name}</strong>
      <p>${item.quantity}x ${formatPrice(item.price)}</p>
      <button class="delete-btn" onclick="removeFromCart('${item.id}')">Remover</button>
    </div>
  `).join("");
}

async function createOrderAndCheckout() {
  if (!cart.length) {
    alert("Adicione algum produto ao carrinho primeiro.");
    return;
  }

  const customerName = document.getElementById("customerName").value.trim();
  const customerEmail = document.getElementById("customerEmail").value.trim();
  const customerPhone = document.getElementById("customerPhone").value.trim();

  if (!customerName || !customerEmail || !customerPhone) {
    alert("Preencha nome, e-mail e WhatsApp para continuar.");
    return;
  }

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const orderId = crypto.randomUUID();

  const { error } = await supabaseClient
    .from("orders")
    .insert({
      id: orderId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      items: cart,
      total,
      status: "pending"
    });

  if (error) {
    alert("Erro ao criar pedido: " + error.message);
    return;
  }

  try {
    const response = await fetch(PAYMENT_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ orderId })
    });

    const result = await response.json();

    if (!response.ok || !result.checkoutUrl) {
      throw new Error(result.error || "A função de pagamento não retornou a URL.");
    }

    window.location.href = result.checkoutUrl;
  } catch (paymentError) {
    alert("Pedido criado, mas o pagamento ainda não está configurado: " + paymentError.message);
  }
}
async function loginAdmin(event) {
  event.preventDefault();

  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    alert("Erro ao entrar: " + error.message);
    return;
  }

  currentUser = data.user;

  await checkAdminPermission();
  updateAdminUI();
  await loadOrders();
}

async function checkAdminPermission() {
  if (!currentUser) {
    isAdmin = false;
    return;
  }

  const { data, error } = await supabaseClient
    .from("admins")
    .select("user_id, email")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  isAdmin = !error && !!data;
}

function updateAdminUI() {
  const loginArea = document.getElementById("loginArea");
  const adminArea = document.getElementById("adminArea");
  const adminEmailLabel = document.getElementById("adminEmailLabel");
  const adminPermissionLabel = document.getElementById("adminPermissionLabel");

  if (!currentUser) {
    loginArea.classList.remove("hidden");
    adminArea.classList.add("hidden");
    return;
  }

  loginArea.classList.add("hidden");
  adminArea.classList.remove("hidden");
  adminEmailLabel.textContent = currentUser.email;

  if (isAdmin) {
    adminPermissionLabel.textContent = "Permissão confirmada: você pode editar a loja.";
  } else {
    adminPermissionLabel.textContent = "Sem permissão de admin: este usuário não pode salvar alterações.";
  }

  renderAdminProducts();
  loadOrders();
}

async function logoutAdmin() {
  await supabaseClient.auth.signOut();

  currentUser = null;
  isAdmin = false;

  updateAdminUI();
}

async function saveProduct(event) {
  event.preventDefault();

  if (!isAdmin) {
    alert("Apenas administradores podem editar a loja.");
    return;
  }

  const id = document.getElementById("productId").value;

  const productData = {
    name: document.getElementById("productName").value.trim(),
    price: Number(document.getElementById("productPrice").value),
    image: document.getElementById("productImage").value.trim(),
    category: document.getElementById("productCategory").value,
    stock: Number(document.getElementById("productStock").value),
    description: document.getElementById("productDescription").value.trim()
  };

  let result;

  if (id) {
    result = await supabaseClient
      .from("products")
      .update(productData)
      .eq("id", id);
  } else {
    result = await supabaseClient
      .from("products")
      .insert(productData);
  }

  if (result.error) {
    alert("Erro ao salvar: " + result.error.message);
    return;
  }

  clearForm();
  await loadProducts();
}

function renderAdminProducts() {
  const adminProducts = document.getElementById("adminProducts");

  if (!adminProducts) return;

  if (!products.length) {
    adminProducts.innerHTML = "<p>Nenhum produto cadastrado.</p>";
    return;
  }

  adminProducts.innerHTML = products.map(product => `
    <div class="admin-item">
      <strong>${product.name}</strong>
      <p>${formatPrice(product.price)} | Estoque: ${product.stock}</p>
      <p>Categoria: ${product.category}</p>

      <div class="admin-list-actions">
        <button class="edit-btn" onclick="editProduct('${product.id}')" ${!isAdmin ? "disabled" : ""}>Editar</button>
        <button class="delete-btn" onclick="deleteProduct('${product.id}')" ${!isAdmin ? "disabled" : ""}>Excluir</button>
      </div>
    </div>
  `).join("");
}

function editProduct(id) {
  if (!isAdmin) {
    alert("Apenas administradores podem editar produtos.");
    return;
  }

  const product = products.find(item => item.id === id);

  if (!product) return;

  document.getElementById("formTitle").textContent = "Editar produto";
  document.getElementById("productId").value = product.id;
  document.getElementById("productName").value = product.name;
  document.getElementById("productPrice").value = product.price;
  document.getElementById("productImage").value = product.image;
  document.getElementById("productCategory").value = product.category;
  document.getElementById("productStock").value = product.stock;
  document.getElementById("productDescription").value = product.description;
}

async function deleteProduct(id) {
  if (!isAdmin) {
    alert("Apenas administradores podem excluir produtos.");
    return;
  }

  const confirmed = confirm("Tem certeza que deseja excluir este produto?");

  if (!confirmed) return;

  const { error } = await supabaseClient
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Erro ao excluir: " + error.message);
    return;
  }

  cart = cart.filter(item => item.id !== id);

  saveCart();
  renderCart();

  await loadProducts();
}

function clearForm() {
  document.getElementById("formTitle").textContent = "Adicionar produto";
  document.getElementById("productId").value = "";
  document.getElementById("productName").value = "";
  document.getElementById("productPrice").value = "";
  document.getElementById("productImage").value = "";
  document.getElementById("productCategory").value = "cetim";
  document.getElementById("productStock").value = "";
  document.getElementById("productDescription").value = "";
}

async function loadOrders() {
  const ordersList = document.getElementById("ordersList");

  if (!ordersList || !isAdmin) return;

  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    ordersList.innerHTML = `<p>Erro ao carregar pedidos: ${error.message}</p>`;
    return;
  }

  if (!data.length) {
    ordersList.innerHTML = "<p>Nenhum pedido ainda.</p>";
    return;
  }

  ordersList.innerHTML = data.map(order => `
    <div class="order-item">
      <strong>${order.customer_name || "Cliente"}</strong>
      <p>${order.customer_email || "Sem e-mail"} | ${order.customer_phone || "Sem telefone"}</p>
      <p>Total: ${formatPrice(order.total)} | Status: ${order.status}</p>
      ${order.payment_url ? `<p><a href="${order.payment_url}" target="_blank">Link de pagamento</a></p>` : ""}
    </div>
  `).join("");
}

function openCart() {
  document.getElementById("overlay").classList.add("open");
  document.getElementById("cartDrawer").classList.add("open");
  document.getElementById("adminPanel").classList.remove("open");
}

function openAdmin() {
  document.getElementById("overlay").classList.add("open");
  document.getElementById("adminPanel").classList.add("open");
  document.getElementById("cartDrawer").classList.remove("open");

  updateAdminUI();
}

function closePanels() {
  document.getElementById("overlay").classList.remove("open");
  document.getElementById("cartDrawer").classList.remove("open");
  document.getElementById("adminPanel").classList.remove("open");
}

init();
