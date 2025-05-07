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
        // Inicializar puntuación para el nuevo jugador
        scores[socket.id] = 0;
        io.emit("update-lobby", players);
    });

    socket.on("start-game", () => {
        questions = [];
        currentQuestionIndex = 0;
        // Reiniciamos puntuaciones manteniendo solo los jugadores actuales
        scores = {};
        players.forEach(player => {
            scores[player.id] = 0;
        });
        currentRoundAnswers = [];
        hasSubmittedAnswer = [];
        io.emit("start-question-phase");
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
                // Inicializar seguimiento de respuestas para nueva ronda
                hasSubmittedAnswer = [];
                const currentQuestion = questions[currentQuestionIndex];
                io.emit("start-answer-phase", { 
                    question: currentQuestion.text,
                    questionAuthor: currentQuestion.author,
                    questionAuthorName: currentQuestion.authorName
                });
            }
        }
    });

    socket.on("submit-answer", (answer) => {
        const currentAuthor = questions[currentQuestionIndex].author;
        const player = players.find(p => p.id === socket.id);
        
        // Solo aceptar si no ha respondido aún (ahora permitimos que el autor responda si quiere)
        if (!hasSubmittedAnswer.includes(socket.id)) {
            currentRoundAnswers.push({
                text: answer,
                author: socket.id,
                authorName: player?.name || "Anónimo",
                votes: 0,
                voters: []
            });
            hasSubmittedAnswer.push(socket.id);
            
            // Verificar si todos han respondido (ahora incluyendo al autor si quiere)
            if (currentRoundAnswers.length >= players.length) {
                // Preparar respuestas para votación con nombres
                const answersForVoting = currentRoundAnswers.map(a => ({
                    text: a.text,
                    authorName: a.authorName,
                    id: a.author // Mantenemos el ID para referencia al votar
                }));
                
                io.emit("start-vote-phase", {
                    answers: answersForVoting,
                    questionAuthor: currentAuthor,
                    questionAuthorName: questions[currentQuestionIndex].authorName
                });
            }
        }
    });

    socket.on("vote", (answerIndex) => {
        // Validar índice y que no haya votado ya
        if (answerIndex >= 0 && answerIndex < currentRoundAnswers.length) {
            const answer = currentRoundAnswers[answerIndex];
            
            if (!answer.voters.includes(socket.id)) {
                answer.voters.push(socket.id);
                answer.votes++;
                
                // Verificar si todos han votado (todos los jugadores)
                const allVoted = currentRoundAnswers.some(a => 
                    a.voters.length === players.length
                ) || 
                currentRoundAnswers.reduce((total, a) => total + a.voters.length, 0) >= players.length;
                
                if (allVoted) {
                    // Ordenar respuestas por votos
                    const rankedAnswers = [...currentRoundAnswers].sort((a, b) => b.votes - a.votes);
                    
                    // Asignar puntos (1 punto por voto recibido)
                    rankedAnswers.forEach(answer => {
                        scores[answer.author] += answer.votes;
                    });
                    
                    // Preparar datos para mostrar con nombres
                    const rankedAnswersWithNames = rankedAnswers.map(a => ({
                        text: a.text,
                        votes: a.votes,
                        authorName: a.authorName
                    }));
                    
                    const scoresWithNames = {};
                    players.forEach(player => {
                        scoresWithNames[player.name] = scores[player.id] || 0;
                    });
                    
                    io.emit("show-results", { 
                        rankedAnswers: rankedAnswersWithNames, 
                        scores: scoresWithNames 
                    });
                    
                    // Preparar siguiente ronda o finalizar juego
                    currentQuestionIndex++;
                    if (currentQuestionIndex < questions.length) {
                        setTimeout(() => {
                            currentRoundAnswers = [];
                            hasSubmittedAnswer = [];
                            const nextQuestion = questions[currentQuestionIndex];
                            io.emit("start-answer-phase", { 
                                question: nextQuestion.text,
                                questionAuthor: nextQuestion.author,
                                questionAuthorName: nextQuestion.authorName
                            });
                        }, 10000); // 10 segundos entre rondas
                    } else {
                        // Juego terminado - enviar puntuaciones finales con nombres
                        const finalScores = {};
                        players.forEach(player => {
                            finalScores[player.name] = scores[player.id] || 0;
                        });
                        io.emit("game-over", finalScores);
                    }
                }
            }
        }
    });

    socket.on("disconnect", () => {
        players = players.filter(p => p.id !== socket.id);
        // No eliminamos su puntuación para no afectar el juego en curso
        io.emit("update-lobby", players);
    });
});

server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
