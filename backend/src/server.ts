import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db";
import chatRoutes from "./routes/chatRoutes";
import ingestRoutes from "./routes/ingestRoutes";
import cvRoutes from "./routes/cvRoutes";
import { Server } from "socket.io";
import http from "http";
import { GitHubAgentService } from "./services/GitHubAgentService";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
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
app.use("/api/cv", cvRoutes);
import industryRoutes from "./routes/industryRoutes";
app.use("/api/industry", industryRoutes);

import learningRoutes from "./routes/learningRoutes";
app.use("/api/learning", learningRoutes);

app.get("/", (req, res) => {
    res.send("RAG Agent Backend Running");
});

// Socket.IO Handling
io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    const agent = new GitHubAgentService();

    socket.on("start-analysis", async (profileUrl: string) => {
        agent.on("frame", (frame) => socket.emit("frame", frame));
        agent.on("status", (status) => socket.emit("status", status));
        agent.on("analysis", (data) => socket.emit("analysis", data));
        agent.on("complete", () => socket.emit("complete"));
        agent.on("error", (err) => socket.emit("error", err));

        await agent.startAnalysis(profileUrl);
    });

    socket.on("pause", () => agent.pause());
    socket.on("resume", () => agent.resume());
    socket.on("stop", () => agent.stop());

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        agent.stop();
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
