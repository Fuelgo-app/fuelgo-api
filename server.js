// server.js — FuelGo API (Postgres connected, CommonJS)

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 8000;

// ---- Middlewares
app.use(cors());
app.use(express.json());

// ---- Database pool (Render: DATABASE_URL + SSL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Helper: eenvoudige db query wrapper
async function q(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

// Root / health
app.get("/", (req, res) => {
  res.send("🚀 FuelGo API is live (DB connected)!");
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("select 1;");
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

/* ===================== VEHICLES ===================== */
// GET all vehicles
app.get("/vehicles", async (req, res) => {
  try {
    const rows = await q(
      "select id, company_id, plate, label, limit_daily, geofence_required, created_at from vehicles order by created_at desc"
    );
    res.json(
      rows.map((v) => ({
        id: v.id,
        companyId: v.company_id,
        plate: v.plate,
        label: v.label,
        limitDaily: Number(v.limit_daily ?? 0),
        geofenceRequired: Boolean(v.geofence_required ?? true),
        createdAt: v.created_at,
      }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Database error" });
  }
});

// POST create vehicle
app.post("/vehicles", async (req, res) => {
  try {
    const {
      companyId = null, // mag null zijn in jouw schema
      plate,
      label,
      limitDaily = 0,
      geofenceRequired = true,
    } = req.body;

    const rows = await q(
      `insert into vehicles (company_id, plate, label, limit_daily, geofence_required)
       values ($1,$2,$3,$4,$5)
       returning id, company_id, plate, label, limit_daily, geofence_required, created_at`,
      [companyId, plate, label, Number(limitDaily), Boolean(geofenceRequired)]
    );

    const v = rows[0];
    res.json({
      id: v.id,
      companyId: v.company_id,
      plate: v.plate,
      label: v.label,
      limitDaily: Number(v.limit_daily ?? 0),
      geofenceRequired: Boolean(v.geofence_required ?? true),
      createdAt: v.created_at,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Insert failed" });
  }
});

/* =================== TRANSACTIONS =================== */
// GET all transactions (frontend verwacht 'when', 'merchant', 'kind', 'plate', 'amount')
app.get("/transactions", async (req, res) => {
  try {
    const rows = await q(
      `select id, company_id, vehicle_id, merchant, kind, amount, when_ts, plate
       from transactions order by when_ts desc`
    );

    // Als leeg, geef 1 demo terug zodat UI iets toont
    if (rows.length === 0) {
      return res.json([
        {
          id: "TX-10021",
          when: new Date().toISOString(),
          merchant: "Shell Almere Poort",
          kind: "Fuel",
          plate: "XX-123-K",
          amount: 82.4,
        },
      ]);
    }

    res.json(
      rows.map((t) => ({
        id: t.id,
        companyId: t.company_id,
        vehicleId: t.vehicle_id,
        merchant: t.merchant,
        kind: t.kind,
        amount: Number(t.amount ?? 0),
        when: t.when_ts,
        plate: t.plate,
      }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Database error" });
  }
});

/* ====================== KM LOG ====================== */
app.post("/km-log", async (req, res) => {
  const { transactionId, km } = req.body || {};
  if (!transactionId || typeof km !== "number") {
    return res.status(400).json({ error: "bad_request" });
  }
  console.log("Km-log:", { transactionId, km });
  return res.json({ ok: true, transactionId, km });
});

/* ==================== WALLET MOCK =================== */
app.post("/wallet/provision", async (req, res) => {
  console.log("Provision:", req.body);
  res.json({ ok: true, platform: req.body?.platform || "unknown" });
});

/* ====================== STARTUP ===================== */
app.listen(PORT, () => {
  console.log(`FuelGo API running on http://localhost:${PORT}`);
});
