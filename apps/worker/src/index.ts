import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json());

app.post("/process", (_req, res) => {
  res.json({ message: "Cloud Run worker ready" });
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Worker listening on 0.0.0.0:${PORT}`);
});
