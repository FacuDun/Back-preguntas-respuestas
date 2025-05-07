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
        
        // Solo aceptar respuestas de jugadores que NO son el autor
        if (socket.id !== currentAuthor && !hasSubmittedAnswer.includes(socket.id)) {
            currentRoundAnswers.push({
                text: answer,
                author: socket.id,
                authorName: player?.name || "Anónimo",
                votes: 0,
                voters: []
            });
            hasSubmittedAnswer.push(socket.id);
            
            // Avanzar cuando todos los NO-autores hayan respondido
            const playersWhoShouldAnswer = players.filter(p => p.id !== currentAuthor).length;
            if (currentRoundAnswers.length >= playersWhoShouldAnswer) {
                const answersForVoting = currentRoundAnswers.map(a => ({
                    text: a.text,
                    authorName: a.authorName
                }));
                
                io.emit("start-vote-phase", {
                    answers: answersForVoting,
                    questionAuthorName: questions[currentQuestionIndex].authorName
                });
            }
        }
    });


socket.on("vote", (answerIndex) => {
    // Validar índice y que la respuesta exista
    if (answerIndex >= 0 && answerIndex < currentRoundAnswers.length) {
        const answer = currentRoundAnswers[answerIndex];
        const voterId = socket.id;
        
        // Verificar que el jugador no haya votado ya en esta ronda
        if (!answer.voters.includes(voterId)) {
            // Registrar el voto
            answer.voters.push(voterId);
            answer.votes++;
            
            // Verificar si TODOS los jugadores han votado (incluyendo al autor)
            const allVoted = players.every(player => 
                currentRoundAnswers.some(a => a.voters.includes(player.id))
            );
            
            if (allVoted) {
                // Notificar a todos que la votación ha finalizado
                io.emit("voting-completed");
                
                // Ordenar respuestas por votos (mayor a menor)
                const rankedAnswers = [...currentRoundAnswers].sort((a, b) => b.votes - a.votes);
                
                // Asignar puntos (1 punto por voto recibido)
                rankedAnswers.forEach(answer => {
                    const authorId = answer.author;
                    if (!scores[authorId]) scores[authorId] = 0;
                    scores[authorId] += answer.votes;
                });
                
                // Preparar datos para el frontend con nombres
                const rankedAnswersWithNames = rankedAnswers.map(a => ({
                    text: a.text,
                    votes: a.votes,
                    authorName: players.find(p => p.id === a.author)?.name || "Anónimo"
                }));
                
                // Convertir scores a nombres
                const scoresWithNames = {};
                players.forEach(player => {
                    scoresWithNames[player.name] = scores[player.id] || 0;
                });
                
                // Enviar resultados después de 2 segundos (para UX)
                setTimeout(() => {
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
                                questionAuthorName: players.find(p => p.id === nextQuestion.author)?.name || "Anónimo"
                            });
                        }, 10000);
                    } else {
                        // Juego terminado
                        const finalScores = {};
                        players.forEach(player => {
                            finalScores[player.name] = scores[player.id] || 0;
                        });
                        io.emit("game-over", finalScores);
                        
                        // Resetear estado para nueva partida
                        currentQuestionIndex = 0;
                        questions = [];
                        currentRoundAnswers = [];
                        hasSubmittedAnswer = [];
                    }
                }, 2000);
            }
        }
    }
});

    
socket.on("vote", (answerIndex) => {
    // Validar que el índice sea correcto
    if (answerIndex >= 0 && answerIndex < currentRoundAnswers.length) {
        const answer = currentRoundAnswers[answerIndex];
        const voter = players.find(p => p.id === socket.id);
        
        if (!voter) return; // Jugador no encontrado
        
        // Verificar que no haya votado ya
        if (!answer.voters.includes(socket.id)) {
            // Registrar el voto
            answer.voters.push(socket.id);
            answer.votes++;
            
            // Verificar si TODOS han votado (incluyendo al autor esta vez)
            const allPlayersVoted = players.every(player => {
                return currentRoundAnswers.some(answer => 
                    answer.voters.includes(player.id)
                );
            });
            
            if (allPlayersVoted) {
                // Ordenar respuestas por votos
                const rankedAnswers = [...currentRoundAnswers].sort((a, b) => b.votes - a.votes);
                
                // Asignar puntos (1 punto por voto)
                rankedAnswers.forEach(answer => {
                    if (!scores[answer.author]) scores[answer.author] = 0;
                    scores[answer.author] += answer.votes;
                });
                
                // Preparar datos para el frontend con nombres
                const rankedAnswersWithNames = rankedAnswers.map(a => ({
                    text: a.text,
                    votes: a.votes,
                    authorName: a.authorName || players.find(p => p.id === a.author)?.name || "Anónimo"
                }));
                
                // Convertir scores a nombres
                const scoresWithNames = {};
                players.forEach(player => {
                    scoresWithNames[player.name] = scores[player.id] || 0;
                });
                
                // Enviar resultados
                io.emit("show-results", {
                    rankedAnswers: rankedAnswersWithNames,
                    scores: scoresWithNames
                });
                
                // Manejar transición de ronda
                handleRoundTransition();
            }
        }
    }
});

// Función separada para manejar la transición
function handleRoundTransition() {
    currentQuestionIndex++;
    if (currentQuestionIndex < questions.length) {
        setTimeout(() => {
            currentRoundAnswers = [];
            hasSubmittedAnswer = [];
            const nextQuestion = questions[currentQuestionIndex];
            io.emit("start-answer-phase", {
                question: nextQuestion.text,
                questionAuthor: nextQuestion.author,
                questionAuthorName: nextQuestion.authorName || 
                    players.find(p => p.id === nextQuestion.author)?.name || "Anónimo"
            });
        }, 10000);
    } else {
        // Juego terminado
        const finalScores = {};
        players.forEach(player => {
            finalScores[player.name] = scores[player.id] || 0;
        });
        io.emit("game-over", finalScores);
        
        // Reset para nueva partida (opcional)
        resetGameState();
    }
}

function resetGameState() {
    currentQuestionIndex = 0;
    questions = [];
    currentRoundAnswers = [];
    hasSubmittedAnswer = [];
    // Mantenemos scores si quieres llevar registro entre partidas
    // scores = {}; // Descomenta si prefieres resetear puntuaciones
}
    
    socket.on("disconnect", () => {
        players = players.filter(p => p.id !== socket.id);
        // No eliminamos su puntuación para no afectar el juego en curso
        io.emit("update-lobby", players);
    });
});

server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
