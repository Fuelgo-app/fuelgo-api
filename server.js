const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Fake data (later kun je dit koppelen aan een database)
let vehicles = [
  { id: 1, plate: "AA-123-B", label: "Caddy #1", limitDaily: 200, geofenceRequired: true },
];

let transactions = [
  { id: 1, merchant: "Shell Almere", when: new Date(), kind: "Fuel", plate: "AA-123-B", amount: 85.5 },
];

// Routes
app.get("/", (req, res) => {
  res.send("🚀 FuelGo API is live!");
});

app.get("/vehicles", (req, res) => {
  res.json(vehicles);
});

app.post("/vehicles", (req, res) => {
  const v = { id: vehicles.length + 1, ...req.body };
  vehicles.push(v);
  res.json(v);
});

app.get("/transactions", (req, res) => {
  res.json(transactions);
});

app.post("/km-log", (req, res) => {
  console.log("Km-log:", req.body);
  res.json({ ok: true });
});

app.post("/wallet/provision", (req, res) => {
  console.log("Provision:", req.body);
  res.json({ ok: true, platform: req.body.platform });
});

// Start server
app.listen(PORT, () => {
  console.log(`FuelGo API running on http://localhost:${PORT}`);
});
