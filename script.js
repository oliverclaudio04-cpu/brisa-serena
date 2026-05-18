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

function getEl(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = getEl(id);
  if (el) el.textContent = text;
}

function setHTML(id, html) {
  const el = getEl(id);
  if (el) el.innerHTML = html;
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatDateBR(dateValue) {
  if (!dateValue) return "Não definido";

  const date = new Date(dateValue + "T00:00:00");

  return date.toLocaleDateString("pt-BR");
}

function addDaysDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);

  return date.toISOString().split("T")[0];
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
  updateCustomerUI();

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;

    if (currentUser) {
      await checkAdminPermission();
    } else {
      isAdmin = false;
    }

    updateAdminUI();
    updateCustomerUI();

    if (currentUser) {
      await loadMyOrders();

      if (isAdmin) {
        await loadOrders();
      }
    }
  });
}

/* PRODUTOS */

async function loadProducts() {
  const grid = getEl("productsGrid");

  if (grid) {
    grid.innerHTML = "<p>Carregando produtos...</p>";
  }

  const { data, error } = await supabaseClient
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    setHTML("productsGrid", `<p>Erro ao carregar produtos: ${error.message}</p>`);
    return;
  }

  products = data || [];

  renderProducts();
  renderAdminProducts();
}

function renderProducts() {
  const grid = getEl("productsGrid");

  if (!grid) return;

  const search = (getEl("searchInput")?.value || "").toLowerCase();
  const category = getEl("categoryFilter")?.value || "todos";

  const filtered = products.filter((product) => {
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

  grid.innerHTML = filtered
    .map(
      (product) => `
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
      `
    )
    .join("");
}

/* CARRINHO E CHECKOUT */

function addToCart(id) {
  const product = products.find((item) => item.id === id);

  if (!product || product.stock <= 0) {
    alert("Produto sem estoque.");
    return;
  }

  const existingItem = cart.find((item) => item.id === id);

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
  cart = cart.filter((item) => item.id !== id);

  saveCart();
  renderCart();
}

function renderCart() {
  const cartItems = getEl("cartItems");
  const cartCount = getEl("cartCount");
  const cartTotal = getEl("cartTotal");

  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (cartCount) {
    cartCount.textContent = totalQuantity;
  }

  if (cartTotal) {
    cartTotal.textContent = `Total: ${formatPrice(total)}`;
  }

  if (!cartItems) return;

  if (!cart.length) {
    cartItems.innerHTML = "<p>Seu carrinho está vazio.</p>";
    return;
  }

  cartItems.innerHTML = cart
    .map(
      (item) => `
        <div class="cart-item">
          <strong>${item.name}</strong>
          <p>${item.quantity}x ${formatPrice(item.price)}</p>
          <button class="delete-btn" onclick="removeFromCart('${item.id}')">Remover</button>
        </div>
      `
    )
    .join("");
}

async function createOrderAndCheckout() {
  if (!cart.length) {
    alert("Adicione algum produto ao carrinho primeiro.");
    return;
  }

  const customerName = getEl("customerName")?.value.trim();
  const customerEmail = getEl("customerEmail")?.value.trim();
  const customerPhone = getEl("customerPhone")?.value.trim();

  if (!customerName || !customerEmail || !customerPhone) {
    alert("Preencha nome, e-mail e WhatsApp para continuar.");
    return;
  }

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const orderId = crypto.randomUUID();

  const orderPayload = {
    id: orderId,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    items: cart,
    total,
    status: "pending",
    delivery_status: "Pedido recebido",
    estimated_delivery: addDaysDate(7),
    tracking_code: null
  };

  if (currentUser) {
    orderPayload.user_id = currentUser.id;
  }

  const { error } = await supabaseClient.from("orders").insert(orderPayload);

  if (error) {
    alert("Erro ao criar pedido: " + error.message);
    return;
  }

  try {
    const response = await fetch(PAYMENT_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ orderId })
    });

    const result = await response.json();

    if (!response.ok || !result.checkoutUrl) {
      throw new Error(result.error || "A função de pagamento não retornou a URL.");
    }

    window.location.href = result.checkoutUrl;
  } catch (paymentError) {
    alert(
      "Pedido criado, mas o pagamento ainda não está configurado: " +
        paymentError.message
    );
  }
}

/* LOGIN DE CLIENTE / MINHA CONTA */

async function registerCustomer(event) {
  if (event) event.preventDefault();

  const email = getEl("customerLoginEmail")?.value.trim();
  const password = getEl("customerLoginPassword")?.value;

  if (!email || !password) {
    alert("Digite e-mail e senha.");
    return;
  }

  if (password.length < 6) {
    alert("A senha precisa ter pelo menos 6 caracteres.");
    return;
  }

  const { error } = await supabaseClient.auth.signUp({
    email,
    password
  });

  if (error) {
    alert("Erro ao criar conta: " + error.message);
    return;
  }

  alert("Conta criada. Verifique seu e-mail para confirmar o cadastro antes de entrar.");
}

async function loginCustomer(event) {
  if (event) event.preventDefault();

  const email = getEl("customerLoginEmail")?.value.trim();
  const password = getEl("customerLoginPassword")?.value;

  if (!email || !password) {
    alert("Digite e-mail e senha.");
    return;
  }

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

  updateCustomerUI();
  updateAdminUI();
  await loadMyOrders();

  alert("Login feito com sucesso.");
}

async function logoutCustomer() {
  await supabaseClient.auth.signOut();

  currentUser = null;
  isAdmin = false;

  location.reload();
}

function updateCustomerUI() {
  const customerLoginArea = getEl("customerLoginArea");
  const customerArea = getEl("customerArea");
  const customerEmailLabel = getEl("customerEmailLabel");

  if (!customerLoginArea || !customerArea) return;

  if (!currentUser) {
    customerLoginArea.classList.remove("hidden");
    customerArea.classList.add("hidden");
    return;
  }

  customerLoginArea.classList.add("hidden");
  customerArea.classList.remove("hidden");

  if (customerEmailLabel) {
    customerEmailLabel.textContent = currentUser.email;
  }

  loadMyOrders();
}

async function loadMyOrders() {
  const myOrdersList = getEl("myOrdersList");

  if (!myOrdersList) return;

  if (!currentUser) {
    myOrdersList.innerHTML = "<p>Entre na sua conta para ver seus pedidos.</p>";
    return;
  }

  myOrdersList.innerHTML = "<p>Carregando seus pedidos...</p>";

  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    myOrdersList.innerHTML = `<p>Erro ao carregar pedidos: ${error.message}</p>`;
    return;
  }

  if (!data.length) {
    myOrdersList.innerHTML =
      "<p>Você ainda não tem pedidos vinculados a esta conta.</p>";
    return;
  }

  myOrdersList.innerHTML = data
    .map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      const itemsText = items
        .map((item) => `${item.quantity}x ${item.name}`)
        .join("<br>");

      return `
        <div class="order-item">
          <strong>Pedido ${String(order.id).slice(0, 8)}</strong>
          <p>Total: ${formatPrice(order.total)}</p>
          <p>Status do pagamento: ${order.status || "pending"}</p>
          <p>Status da entrega: ${order.delivery_status || "Pedido recebido"}</p>
          <p>Prazo estimado: ${formatDateBR(order.estimated_delivery)}</p>
          <p>Rastreio: ${order.tracking_code || "Ainda não informado"}</p>
          <p><strong>Itens:</strong><br>${itemsText}</p>
        </div>
      `;
    })
    .join("");
}

/* ADMIN */

async function loginAdmin(event) {
  event.preventDefault();

  const email = getEl("adminEmail")?.value.trim();
  const password = getEl("adminPassword")?.value;

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
  updateCustomerUI();

  if (isAdmin) {
    await loadOrders();
  }
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
  const loginArea = getEl("loginArea");
  const adminArea = getEl("adminArea");
  const adminEmailLabel = getEl("adminEmailLabel");
  const adminPermissionLabel = getEl("adminPermissionLabel");

  if (!loginArea || !adminArea) return;

  if (!currentUser) {
    loginArea.classList.remove("hidden");
    adminArea.classList.add("hidden");
    return;
  }

  if (!isAdmin) {
    loginArea.classList.remove("hidden");
    adminArea.classList.add("hidden");

    loginArea.innerHTML = `
      <div class="status-box">
        <strong>Você está logado como:</strong><br>
        ${currentUser.email}<br><br>
        Esta conta não tem permissão de administrador.
      </div>

      <button class="logout-btn" onclick="logoutAdmin()">
        Sair da conta
      </button>
    `;

    return;
  }

  loginArea.classList.add("hidden");
  adminArea.classList.remove("hidden");

  if (adminEmailLabel) {
    adminEmailLabel.textContent = currentUser.email;
  }

  if (adminPermissionLabel) {
    adminPermissionLabel.textContent =
      "Permissão confirmada: você pode editar a loja.";
  }

  renderAdminProducts();
  loadOrders();
}

async function logoutAdmin() {
  await logoutCustomer();
}

async function saveProduct(event) {
  event.preventDefault();

  if (!isAdmin) {
    alert("Apenas administradores podem editar a loja.");
    return;
  }

  const id = getEl("productId")?.value;

  const productData = {
    name: getEl("productName")?.value.trim(),
    price: Number(getEl("productPrice")?.value),
    image: getEl("productImage")?.value.trim(),
    category: getEl("productCategory")?.value,
    stock: Number(getEl("productStock")?.value),
    description: getEl("productDescription")?.value.trim()
  };

  if (
    !productData.name ||
    !productData.price ||
    !productData.image ||
    !productData.description
  ) {
    alert("Preencha todos os dados do produto.");
    return;
  }

  let result;

  if (id) {
    result = await supabaseClient
      .from("products")
      .update(productData)
      .eq("id", id);
  } else {
    result = await supabaseClient.from("products").insert(productData);
  }

  if (result.error) {
    alert("Erro ao salvar: " + result.error.message);
    return;
  }

  clearForm();
  await loadProducts();

  alert("Produto salvo com sucesso.");
}

function renderAdminProducts() {
  const adminProducts = getEl("adminProducts");

  if (!adminProducts) return;

  if (!products.length) {
    adminProducts.innerHTML = "<p>Nenhum produto cadastrado.</p>";
    return;
  }

  adminProducts.innerHTML = products
    .map(
      (product) => `
        <div class="admin-item">
          <strong>${product.name}</strong>
          <p>${formatPrice(product.price)} | Estoque: ${product.stock}</p>
          <p>Categoria: ${product.category}</p>

          <div class="admin-list-actions">
            <button
              class="edit-btn"
              onclick="editProduct('${product.id}')"
              ${!isAdmin ? "disabled" : ""}
            >
              Editar
            </button>

            <button
              class="delete-btn"
              onclick="deleteProduct('${product.id}')"
              ${!isAdmin ? "disabled" : ""}
            >
              Excluir
            </button>
          </div>
        </div>
      `
    )
    .join("");
}

function editProduct(id) {
  if (!isAdmin) {
    alert("Apenas administradores podem editar produtos.");
    return;
  }

  const product = products.find((item) => item.id === id);

  if (!product) return;

  setText("formTitle", "Editar produto");

  if (getEl("productId")) getEl("productId").value = product.id;
  if (getEl("productName")) getEl("productName").value = product.name;
  if (getEl("productPrice")) getEl("productPrice").value = product.price;
  if (getEl("productImage")) getEl("productImage").value = product.image;
  if (getEl("productCategory")) getEl("productCategory").value = product.category;
  if (getEl("productStock")) getEl("productStock").value = product.stock;
  if (getEl("productDescription")) {
    getEl("productDescription").value = product.description;
  }
}

async function deleteProduct(id) {
  if (!isAdmin) {
    alert("Apenas administradores podem excluir produtos.");
    return;
  }

  const confirmed = confirm("Tem certeza que deseja excluir este produto?");

  if (!confirmed) return;

  const { error } = await supabaseClient.from("products").delete().eq("id", id);

  if (error) {
    alert("Erro ao excluir: " + error.message);
    return;
  }

  cart = cart.filter((item) => item.id !== id);

  saveCart();
  renderCart();

  await loadProducts();

  alert("Produto excluído com sucesso.");
}

function clearForm() {
  setText("formTitle", "Adicionar produto");

  if (getEl("productId")) getEl("productId").value = "";
  if (getEl("productName")) getEl("productName").value = "";
  if (getEl("productPrice")) getEl("productPrice").value = "";
  if (getEl("productImage")) getEl("productImage").value = "";
  if (getEl("productCategory")) getEl("productCategory").value = "cetim";
  if (getEl("productStock")) getEl("productStock").value = "";
  if (getEl("productDescription")) getEl("productDescription").value = "";
}

async function loadOrders() {
  const ordersList = getEl("ordersList");

  if (!ordersList || !isAdmin) return;

  ordersList.innerHTML = "<p>Carregando pedidos...</p>";

  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    ordersList.innerHTML = `<p>Erro ao carregar pedidos: ${error.message}</p>`;
    return;
  }

  if (!data.length) {
    ordersList.innerHTML = "<p>Nenhum pedido ainda.</p>";
    return;
  }

  ordersList.innerHTML = data
    .map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      const itemsText = items
        .map((item) => `${item.quantity}x ${item.name}`)
        .join("<br>");

      return `
        <div class="order-item">
          <strong>Pedido ${String(order.id).slice(0, 8)}</strong>
          <p>${order.customer_name || "Cliente"}</p>
          <p>${order.customer_email || "Sem e-mail"} | ${
        order.customer_phone || "Sem telefone"
      }</p>
          <p>Total: ${formatPrice(order.total)} | Pagamento: ${order.status}</p>
          <p><strong>Itens:</strong><br>${itemsText}</p>

          <div class="admin-form">
            <input
              class="input"
              id="deliveryStatus-${order.id}"
              value="${order.delivery_status || "Pedido recebido"}"
              placeholder="Status da entrega"
            />

            <input
              class="input"
              id="estimatedDelivery-${order.id}"
              type="date"
              value="${order.estimated_delivery || ""}"
            />

            <input
              class="input"
              id="trackingCode-${order.id}"
              value="${order.tracking_code || ""}"
              placeholder="Código de rastreio"
            />

            <button class="save-btn" onclick="updateOrderDelivery('${order.id}')">
              Atualizar entrega
            </button>
          </div>

          ${
            order.payment_url
              ? `<p><a href="${order.payment_url}" target="_blank">Link de pagamento</a></p>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

async function updateOrderDelivery(orderId) {
  if (!isAdmin) {
    alert("Apenas administradores podem atualizar pedidos.");
    return;
  }

  const deliveryStatus = getEl(`deliveryStatus-${orderId}`)?.value.trim();
  const estimatedDelivery = getEl(`estimatedDelivery-${orderId}`)?.value || null;
  const trackingCode = getEl(`trackingCode-${orderId}`)?.value.trim() || null;

  const { error } = await supabaseClient
    .from("orders")
    .update({
      delivery_status: deliveryStatus,
      estimated_delivery: estimatedDelivery,
      tracking_code: trackingCode
    })
    .eq("id", orderId);

  if (error) {
    alert("Erro ao atualizar entrega: " + error.message);
    return;
  }

  alert("Entrega atualizada com sucesso.");

  await loadOrders();
}

/* ABRIR E FECHAR PAINÉIS */

function openCart() {
  getEl("overlay")?.classList.add("open");
  getEl("cartDrawer")?.classList.add("open");
  getEl("adminPanel")?.classList.remove("open");
  getEl("customerPanel")?.classList.remove("open");
}

function openAdmin() {
  getEl("overlay")?.classList.add("open");
  getEl("adminPanel")?.classList.add("open");
  getEl("cartDrawer")?.classList.remove("open");
  getEl("customerPanel")?.classList.remove("open");

  updateAdminUI();
}

function openCustomerAccount() {
  getEl("overlay")?.classList.add("open");
  getEl("customerPanel")?.classList.add("open");
  getEl("cartDrawer")?.classList.remove("open");
  getEl("adminPanel")?.classList.remove("open");

  updateCustomerUI();
}

function closePanels() {
  getEl("overlay")?.classList.remove("open");
  getEl("cartDrawer")?.classList.remove("open");
  getEl("adminPanel")?.classList.remove("open");
  getEl("customerPanel")?.classList.remove("open");
}

init();