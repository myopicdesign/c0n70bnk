// IMPORTANTE: sostituisci con la tua VAPID public key (vedi README).
const VAPID_PUBLIC_KEY = "INCOLLA_QUI_LA_TUA_VAPID_PUBLIC_KEY";

const balanceEl = document.getElementById("balance");
const monthDeltaEl = document.getElementById("month-delta");
const txListEl = document.getElementById("tx-list");
const notifBtn = document.getElementById("notif-btn");
const setupCard = document.getElementById("setup-card");

const subscribeBtn = document.getElementById("subscribe-btn");
const statusEl = document.getElementById("status");
const stepCopy = document.getElementById("step-copy");
const subJsonEl = document.getElementById("sub-json");
const copyBtn = document.getElementById("copy-btn");
const copyStatus = document.getElementById("copy-status");

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eurFull = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

notifBtn.addEventListener("click", () => setupCard.classList.toggle("hidden"));

// --- Caricamento saldo e transazioni ---

async function loadData() {
  try {
    const [stateRes, txRes] = await Promise.all([
      fetch(`data/state.json?t=${Date.now()}`),
      fetch(`data/transactions.json?t=${Date.now()}`),
    ]);
    const state = await stateRes.json();
    const transactions = await txRes.json();
    renderBalance(state, transactions);
    renderTransactions(transactions);
  } catch (e) {
    txListEl.innerHTML = `<p class="tx-empty">Impossibile caricare i dati.</p>`;
  }
}

function renderBalance(state, transactions) {
  balanceEl.textContent = eurFull.format(state.balance);

  const now = new Date();
  const thisMonth = transactions.filter((t) => {
    const d = new Date(t.timestamp);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && t.type === "incoming";
  });
  const delta = thisMonth.reduce((sum, t) => sum + t.amount, 0);
  monthDeltaEl.textContent = `+${eur.format(delta)} questo mese`;
}

function dayLabel(date) {
  const now = new Date();
  const d = new Date(date);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (sameDay(d, now)) return "Oggi";
  if (sameDay(d, yesterday)) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

function renderTransactions(transactions) {
  if (!transactions.length) {
    txListEl.innerHTML = `<p class="tx-empty">Nessuna transazione.</p>`;
    return;
  }

  const sorted = [...transactions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  let html = "";
  let lastLabel = null;

  for (const t of sorted) {
    const label = dayLabel(t.timestamp);
    if (label !== lastLabel) {
      html += `<div class="tx-group-label">${label}</div>`;
      lastLabel = label;
    }
    const time = new Date(t.timestamp).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    const isIncoming = t.type === "incoming";
    const icon = isIncoming ? "↓" : "•";
    const sign = isIncoming ? "+" : "";

    html += `
      <div class="tx-row">
        <div class="tx-icon ${isIncoming ? "incoming" : ""}">${icon}</div>
        <div class="tx-info">
          <div class="tx-title">${escapeHtml(t.title)}</div>
          <div class="tx-time">${time}</div>
        </div>
        <div class="tx-amount ${isIncoming ? "incoming" : "outgoing"}">${sign}${eurFull.format(t.amount)}</div>
      </div>
    `;
  }

  txListEl.innerHTML = html;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

loadData();

// --- Notifiche push (stessa logica dell'iscrizione, riadattata) ---

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function initPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    statusEl.textContent = "Notifiche non supportate: apri l'app dalla schermata Home (Safari, iOS 16.4+).";
    subscribeBtn.disabled = true;
    return;
  }

  const reg = await navigator.serviceWorker.register("sw.js");
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    showSubscription(existing);
    statusEl.textContent = "Notifiche già attive su questo dispositivo.";
  }

  subscribeBtn.addEventListener("click", () => subscribe(reg));
}

async function subscribe(reg) {
  subscribeBtn.disabled = true;
  statusEl.textContent = "Richiesta permesso in corso…";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    statusEl.textContent = "Permesso negato.";
    subscribeBtn.disabled = false;
    return;
  }

  if (VAPID_PUBLIC_KEY.startsWith("INCOLLA")) {
    statusEl.textContent = "Manca la VAPID public key in app.js. Vedi il README.";
    subscribeBtn.disabled = false;
    return;
  }

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    showSubscription(sub);
    statusEl.textContent = "Notifiche attivate. Copia il blocco qui sotto nel repo.";
  } catch (err) {
    statusEl.textContent = "Errore: " + err.message;
  } finally {
    subscribeBtn.disabled = false;
  }
}

function showSubscription(sub) {
  stepCopy.classList.remove("hidden");
  subJsonEl.value = JSON.stringify(sub.toJSON(), null, 2);
}

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(subJsonEl.value);
    copyStatus.textContent = "Copiato negli appunti.";
  } catch (e) {
    subJsonEl.select();
    document.execCommand("copy");
    copyStatus.textContent = "Copiato negli appunti.";
  }
});

initPush();
