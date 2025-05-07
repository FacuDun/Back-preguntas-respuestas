const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Permitir cualquier origen (en producción, usa tu dominio)
    },
});

const PORT = process.env.PORT || 3000;

let players = [];
let questions = [];
let currentQuestionIndex = 0;
let scores = {};

io.on("connection", (socket) => {
    console.log("Nuevo usuario conectado:", socket.id);

    socket.on("join", (username) => {
        const isAdmin = username === "Facu";
        players.push({ id: socket.id, name: username, isAdmin });
        io.emit("update-lobby", players);
    });

    socket.on("start-game", () => {
        io.emit("start-question-phase");
    });

    socket.on("submit-question", (question) => {
        questions.push({ text: question, author: socket.id });
        if (questions.length === players.length) {
            io.emit("start-answer-phase", questions[0].text);
        }
    });

    socket.on("submit-answer", (answer) => {
        // Guardar respuesta y pasar a votación si todos respondieron
        // (Lógica simplificada, implementa según tu necesidad)
        io.emit("start-vote-phase", answers);
    });

    socket.on("vote", (answerIndex) => {
        // Procesar votos y calcular resultados
        io.emit("show-results", rankedAnswers, scores);
    });

    socket.on("disconnect", () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit("update-lobby", players);
    });
});

server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
