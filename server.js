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
let currentRoundAnswers = [];
let hasSubmittedAnswer = [];

// Funciones auxiliares
function startAnswerPhase() {
    const currentQuestion = questions[currentQuestionIndex];
    io.emit("start-answer-phase", { 
        question: currentQuestion.text,
        questionAuthor: currentQuestion.author,
        questionAuthorName: currentQuestion.authorName
    });
}

function startVotePhase() {
    const answersForVoting = currentRoundAnswers.map(a => ({
        text: a.text,
        authorName: a.authorName
    }));
    
    io.emit("start-vote-phase", {
        answers: answersForVoting,
        questionAuthorName: questions[currentQuestionIndex].authorName
    });
}

function processResults() {
    const rankedAnswers = [...currentRoundAnswers].sort((a, b) => b.votes - a.votes);
    
    // Asignar puntos
    rankedAnswers.forEach(answer => {
        scores[answer.author] = (scores[answer.author] || 0) + answer.votes;
    });
    
    // Preparar datos para el frontend
    const rankedAnswersWithNames = rankedAnswers.map(a => ({
        text: a.text,
        votes: a.votes,
        authorName: a.authorName
    }));
    
    const scoresWithNames = {};
    players.forEach(player => {
        scoresWithNames[player.name] = scores[player.id] || 0;
    });
    
    // Enviar resultados
    io.emit("show-results", {
        rankedAnswers: rankedAnswersWithNames,
        scores: scoresWithNames
    });
}

function nextRoundOrEndGame() {
    currentQuestionIndex++;
    if (currentQuestionIndex < questions.length) {
        setTimeout(() => {
            currentRoundAnswers = [];
            hasSubmittedAnswer = [];
            startAnswerPhase();
        }, 10000);
    } else {
        endGame();
    }
}

socket.on("disconnect", () => {
    const disconnectedPlayer = players.find(p => p.id === socket.id);
    
    if (disconnectedPlayer) {
        console.log(`Jugador desconectado: ${disconnectedPlayer.name}`);
        players = players.filter(p => p.id !== socket.id);
        
        // Si era el último jugador, limpiar todo
        if (players.length === 0) {
            resetGame();
            console.log("Todos desconectados. Estado resetado.");
        }
        
        io.emit("update-lobby", players);
    }
});

function resetGame() {
    questions = [];
    currentQuestionIndex = 0;
    scores = {};
    currentRoundAnswers = [];
    hasSubmittedAnswer = [];
    console.log("Estado del juego completamente resetado");
}

function endGame() {
    const finalScores = {};
    players.forEach(player => {
        finalScores[player.name] = scores[player.id] || 0;
    });
    io.emit("game-over", finalScores);
    resetGame();
}

// Eventos del Socket
io.on("connection", (socket) => {
    console.log("Nuevo usuario conectado:", socket.id);

    socket.on("join", (username) => {
        const isAdmin = username === "Facu";
        const player = { id: socket.id, name: username, isAdmin };
        players.push(player);
        scores[socket.id] = 0;
        io.emit("update-lobby", players);
    });

    socket.on("start-game", () => {
        // Limpieza completa
        questions = [];
        currentQuestionIndex = 0;
        scores = {};
        currentRoundAnswers = [];
        hasSubmittedAnswer = [];
        
        // Reiniciar puntuaciones solo para jugadores activos
        players.forEach(player => {
            scores[player.id] = 0;
        });
        
        io.emit("start-question-phase");
        console.log("Nueva partida iniciada. Estado limpiado."); // Debug
    });

    socket.on("submit-question", (question) => {
        if (!questions.some(q => q.author === socket.id)) {
            const player = players.find(p => p.id === socket.id);
            questions.push({ 
                text: question, 
                author: socket.id,
                authorName: player?.name || "Anónimo" 
            });
            
            if (questions.length === players.length) {
                hasSubmittedAnswer = [];
                startAnswerPhase();
            }
        }
    });

    socket.on("submit-answer", (answer) => {
        const currentAuthor = questions[currentQuestionIndex].author;
        const player = players.find(p => p.id === socket.id);
        
        if (socket.id !== currentAuthor && !hasSubmittedAnswer.includes(socket.id)) {
            currentRoundAnswers.push({
                text: answer,
                author: socket.id,
                authorName: player?.name || "Anónimo",
                votes: 0,
                voters: []
            });
            hasSubmittedAnswer.push(socket.id);
            
            const playersWhoShouldAnswer = players.filter(p => p.id !== currentAuthor).length;
            if (currentRoundAnswers.length >= playersWhoShouldAnswer) {
                startVotePhase();
            }
        }
    });

    socket.on("vote", (answerIndex) => {
        if (answerIndex >= 0 && answerIndex < currentRoundAnswers.length) {
            const answer = currentRoundAnswers[answerIndex];
            
            if (!answer.voters.includes(socket.id)) {
                answer.voters.push(socket.id);
                answer.votes++;
                
                const allVoted = players.every(player => 
                    currentRoundAnswers.some(a => a.voters.includes(player.id))
                );
                
                if (allVoted) {
                    io.emit("voting-completed");
                    setTimeout(() => {
                        processResults();
                        nextRoundOrEndGame();
                    }, 2000);
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
