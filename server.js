// server.js - FuelGo MVP auth + vehicles
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ----- CORS -----
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*"
}));
app.use(express.json());

// ---------- Helpers ----------
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
}

async function auth(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: "no_token" });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "bad_token" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: "forbidden" });
    next();
  };
}

// ---------- Health ----------
app.get("/", (_, res) => res.send("🚀 FuelGo API is live"));
app.get("/health", (_, res) => res.json({ ok: true }));

// ---------- Auth ----------
// 1) Sign-up bedrijf + admin
app.post("/auth/signup-company", async (req, res) => {
  try {
    const { companyName, email, password, firstName, lastName } = req.body;
    if (!companyName || !email || !password) return res.status(400).json({ error: "missing_fields" });

    const pwHash = await bcrypt.hash(password, 10);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const c = await client.query(
        `insert into companies (name) values ($1) returning id, name`,
        [companyName]
      );
      const companyId = c.rows[0].id;

      const u = await client.query(
        `insert into users (company_id, email, password_hash, role, first_name, last_name)
         values ($1,$2,$3,'admin',$4,$5)
         returning id, email, role, first_name, last_name`,
        [companyId, email, pwHash, firstName || null, lastName || null]
      );
      await client.query("COMMIT");

      const token = signToken({ userId: u.rows[0].id, companyId, role: "admin" });
      return res.status(201).json({ token, user: u.rows[0], company: c.rows[0] });
    } catch (e) {
      await client.query("ROLLBACK");
      if (String(e.message).includes("unique")) return res.status(409).json({ error: "email_exists" });
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

// 2) Login
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const q = await pool.query(
      `select id, company_id, email, password_hash, role, first_name, last_name
       from users where email=$1`, [email]
    );
    if (q.rowCount === 0) return res.status(401).json({ error: "invalid_login" });

    const user = q.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_login" });

    const token = signToken({ userId: user.id, companyId: user.company_id, role: user.role });
    delete user.password_hash;
    res.json({ token, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

// 3) Invite werknemer (admin)
const crypto = require("crypto");
app.post("/invites", auth, requireRole("admin"), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "missing_email" });
    const token = crypto.randomBytes(16).toString("hex");

    await pool.query(
      `insert into invites (company_id, email, role, token) values ($1,$2,'employee',$3)`,
      [req.user.companyId, email, token]
    );
    // In echt: mail deze invite-link
    // Voor nu: geef hem terug:
    res.status(201).json({ inviteUrl: `/invites/accept?token=${token}&email=${encodeURIComponent(email)}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

// 4) Accept invite → account aanmaken (werknemer)
app.post("/invites/accept", async (req, res) => {
  try {
    const { token, email, password } = req.body;
    if (!token || !email || !password) return res.status(400).json({ error: "missing_fields" });

    const inv = await pool.query(
      `select * from invites where token=$1 and email=$2 and used=false`, [token, email]
    );
    if (inv.rowCount === 0) return res.status(400).json({ error: "invalid_invite" });

    const pwHash = await bcrypt.hash(password, 10);
    const companyId = inv.rows[0].company_id;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const u = await client.query(
        `insert into users (company_id, email, password_hash, role)
         values ($1,$2,$3,'employee') returning id, email, role`,
        [companyId, email, pwHash]
      );
      await client.query(`update invites set used=true where id=$1`, [inv.rows[0].id]);
      await client.query("COMMIT");

      const tokenJwt = signToken({ userId: u.rows[0].id, companyId, role: "employee" });
      res.status(201).json({ token: tokenJwt, user: u.rows[0] });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally { client.release(); }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

// ---------- Vehicles (bedrijf-gebonden) ----------
app.get("/vehicles", auth, async (req, res) => {
  const q = await pool.query(
    `select id, plate, label, limit_daily as "limitDaily", geofence_required as "geofenceRequired"
     from vehicles where company_id=$1 order by created_at desc`,
    [req.user.companyId]
  );
  res.json(q.rows);
});

app.post("/vehicles", auth, async (req, res) => {
  const { plate, label, limitDaily, geofenceRequired } = req.body;
  if (!plate) return res.status(400).json({ error: "missing_plate" });

  const q = await pool.query(
    `insert into vehicles (company_id, plate, label, limit_daily, geofence_required)
     values ($1,$2,$3,$4,$5)
     returning id, plate, label, limit_daily as "limitDaily", geofence_required as "geofenceRequired"`,
    [req.user.companyId, plate, label || null, limitDaily || 0, geofenceRequired !== false]
  );
  res.status(201).json(q.rows[0]);
});

// (optioneel later) transactions/km-log/invoices exact zoals tabellen
// ---------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`FuelGo API running on http://localhost:${PORT}`);
});
