import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db";
import chatRoutes from "./routes/chatRoutes";
import ingestRoutes from "./routes/ingestRoutes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Connect to DB
connectDB();

import authRoutes from "./routes/authRoutes";

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/ingest", ingestRoutes);

app.get("/", (req, res) => {
    res.send("RAG Agent Backend Running");
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
