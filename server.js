const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: [
            "https://facudun.github.io/Front-pregunta-respuesta",
            "https://facudun.github.io"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

const PORT = process.env.PORT || 10000;

// Variables de estado del juego
let players = [];
let questions = [];
let currentQuestionIndex = 0;
let scores = {};
let currentRoundAnswers = [];  // Respuestas de la ronda actual solamente
let hasSubmittedAnswer = [];   // Trackear quién ha respondido

io.on("connection", (socket) => {
    console.log("Nuevo usuario conectado:", socket.id);

    socket.on("join", (username) => {
        const isAdmin = username === "Facu";
        const player = { id: socket.id, name: username, isAdmin };
        players.push(player);
        io.emit("update-lobby", players);
    });

    socket.on("start-game", () => {
        questions = [];
        currentQuestionIndex = 0;
        scores = {};
        currentRoundAnswers = [];
        hasSubmittedAnswer = [];
        io.emit("start-question-phase");
    });

    socket.on("submit-question", (question) => {
        if (!questions.some(q => q.author === socket.id)) {
            questions.push({ text: question, author: socket.id });
            
            if (questions.length === players.length) {
                // Inicializar seguimiento de respuestas para nueva ronda
                hasSubmittedAnswer = [];
                io.emit("start-answer-phase", { 
                    question: questions[currentQuestionIndex].text,
                    questionAuthor: questions[currentQuestionIndex].author 
                });
            }
        }
    });

    socket.on("submit-answer", (answer) => {
        const currentAuthor = questions[currentQuestionIndex].author;
        
        // Solo aceptar si: no es el autor y no ha respondido aún
        if (socket.id !== currentAuthor && !hasSubmittedAnswer.includes(socket.id)) {
            currentRoundAnswers.push({
                text: answer,
                author: socket.id,
                votes: 0
            });
            hasSubmittedAnswer.push(socket.id);
            
            // Verificar si todos los que deben responder lo han hecho
            const playersWhoShouldAnswer = players.filter(p => p.id !== currentAuthor).length;
            
            if (currentRoundAnswers.length >= playersWhoShouldAnswer) {
                io.emit("start-vote-phase", {
                    answers: currentRoundAnswers,
                    questionAuthor: currentAuthor
                });
            }
        }
    });

    socket.on("vote", (answerIndex) => {
        const currentAuthor = questions[currentQuestionIndex].author;
        const voterId = socket.id;
        
        // Validar: no es el autor, índice válido, y no ha votado antes
        if (voterId !== currentAuthor && 
            answerIndex >= 0 && 
            answerIndex < currentRoundAnswers.length &&
            !currentRoundAnswers.some(a => a.voters && a.voters.includes(voterId))) {
            
            // Inicializar array de votantes si no existe
            currentRoundAnswers[answerIndex].voters = currentRoundAnswers[answerIndex].voters || [];
            currentRoundAnswers[answerIndex].voters.push(voterId);
            currentRoundAnswers[answerIndex].votes++;
            
            // Verificar si todos han votado (todos menos el autor)
            const votersCount = players.filter(p => p.id !== currentAuthor).length;
            const totalVotes = currentRoundAnswers.reduce((sum, a) => sum + (a.voters ? a.voters.length : 0), 0);
            
            if (totalVotes >= votersCount) {
                const rankedAnswers = [...currentRoundAnswers].sort((a, b) => b.votes - a.votes);
                
                // Asignar puntos (más puntos para los primeros lugares)
                rankedAnswers.forEach((answer, index) => {
                    if (!scores[answer.author]) scores[answer.author] = 0;
                    scores[answer.author] += (currentRoundAnswers.length - index);
                });
                
                io.emit("show-results", { 
                    rankedAnswers, 
                    scores 
                });
                
                // Preparar siguiente ronda o finalizar
                currentQuestionIndex++;
                if (currentQuestionIndex < questions.length) {
                    setTimeout(() => {
                        currentRoundAnswers = []; // Limpiar para nueva ronda
                        hasSubmittedAnswer = [];
                        io.emit("start-answer-phase", { 
                            question: questions[currentQuestionIndex].text,
                            questionAuthor: questions[currentQuestionIndex].author 
                        });
                    }, 10000); // 10 segundos para ver resultados
                } else {
                    io.emit("game-over", scores);
                }
            }
        }
    });

    socket.on("disconnect", () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit("update-lobby", players);
    });
});

server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
