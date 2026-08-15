// Eseguito da GitHub Actions ogni 3 ore.
// Genera un "bonifico in entrata" con importo casuale, aggiorna il saldo
// e la lista transazioni in data/, poi invia la notifica push a tutte le
// iscrizioni. Il workflow si occupa di fare commit dei file aggiornati.

const fs = require("fs");
const path = require("path");
const webpush = require("web-push");

const ROOT = path.join(__dirname, "..");
const STATE_PATH = path.join(ROOT, "data", "state.json");
const TX_PATH = path.join(ROOT, "data", "transactions.json");
const SUBS_PATH = path.join(ROOT, "data", "subscriptions.json");

const AMOUNTS = [126, 254, 512, 720, 323, 1243];
const MAX_TRANSACTIONS_KEPT = 40;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:example@example.com";

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("Mancano VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY tra le variabili d'ambiente (GitHub Secrets).");
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return fallback;
  return JSON.parse(raw);
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function pickRandomAmount() {
  return AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)];
}

async function main() {
  const state = loadJson(STATE_PATH, { balance: 0, currency: "EUR" });
  const transactions = loadJson(TX_PATH, []);
  const subscriptions = loadJson(SUBS_PATH, []);

  const amount = pickRandomAmount();
  const now = new Date().toISOString();
  const title = `Bonifico a tuo favore di ${amount}€`;

  // aggiorna saldo
  state.balance = Math.round((state.balance + amount) * 100) / 100;
  state.updated_at = now;
  saveJson(STATE_PATH, state);

  // aggiunge la transazione in cima, tiene solo le ultime N
  transactions.unshift({
    id: `tx-${Date.now()}`,
    title,
    timestamp: now,
    amount,
    type: "incoming",
  });
  saveJson(TX_PATH, transactions.slice(0, MAX_TRANSACTIONS_KEPT));

  console.log(`Nuovo bonifico: ${title} — nuovo saldo: ${state.balance}€`);

  if (subscriptions.length === 0) {
    console.log("Nessuna iscrizione push presente: notifica non inviata (ma saldo/transazioni aggiornati).");
    return;
  }

  for (const sub of subscriptions) {
    try {
      const result = await webpush.sendNotification(
        sub,
        JSON.stringify({
          title: "Bonifico a vostro favore",
          body: `${amount}€`,
          tag: "bonifico",
        }),
        {
          urgency: "high", // chiede al server push di consegnare con priorità massima
          TTL: 60 * 60 * 6, // scarta la notifica se non consegnata entro 6 ore (evita notifiche "vecchie" in ritardo)
        }
      );
      console.log(`Notifica accettata dal server push (status ${result.statusCode}).`);
    } catch (err) {
      console.error(`Invio fallito (status ${err.statusCode || "?"}):`, err.message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
