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
let answers = [];
let currentQuestionIndex = 0;
let scores = {};
let submittedAnswers = 0;

io.on("connection", (socket) => {
    console.log("Nuevo usuario conectado:", socket.id);

    socket.on("join", (username) => {
        const isAdmin = username === "Facu";
        players.push({ id: socket.id, name: username, isAdmin });
        io.emit("update-lobby", players);
    });

    socket.on("start-game", () => {
        questions = []; // Reiniciar preguntas al comenzar nuevo juego
        currentQuestionIndex = 0;
        scores = {};
        io.emit("start-question-phase");
    });

    socket.on("submit-question", (question) => {
        if (!questions.some(q => q.author === socket.id)) {
            questions.push({ text: question, author: socket.id });
            
            if (questions.length === players.length) {
                io.emit("start-answer-phase", questions[currentQuestionIndex].text);
            }
        }
    });

    socket.on("submit-answer", (answer) => {
        // Verificar que el jugador no haya enviado ya una respuesta
        if (!answers.some(a => a.author === socket.id)) {
            answers.push({
                text: answer,
                author: socket.id,
                votes: 0,
                questionIndex: currentQuestionIndex
            });
            submittedAnswers++;
            
            // Verificar si todos respondieron (excepto el autor de la pregunta)
            const currentAuthor = questions[currentQuestionIndex].author;
            const playersWhoShouldAnswer = players.filter(p => p.id !== currentAuthor).length;
            
            if (submittedAnswers >= playersWhoShouldAnswer) {
                io.emit("start-vote-phase", answers.filter(a => a.questionIndex === currentQuestionIndex));
                submittedAnswers = 0;
            }
        }
    });

    socket.on("vote", (answerIndex) => {
        // Validar el índice de respuesta
        if (answerIndex >= 0 && answerIndex < answers.length) {
            answers[answerIndex].votes++;
            
            // Verificar si todos votaron (todos menos el autor de la pregunta)
            const currentAuthor = questions[currentQuestionIndex].author;
            const votersCount = players.filter(p => p.id !== currentAuthor).length;
            const totalVotes = answers.filter(a => a.questionIndex === currentQuestionIndex)
                                     .reduce((sum, a) => sum + a.votes, 0);
            
            if (totalVotes >= votersCount) {
                // Preparar resultados ordenados
                const currentAnswers = answers.filter(a => a.questionIndex === currentQuestionIndex);
                const rankedAnswers = [...currentAnswers].sort((a, b) => b.votes - a.votes);
                
                // Actualizar puntajes (más puntos para mejor rankeados)
                rankedAnswers.forEach((answer, index) => {
                    if (!scores[answer.author]) scores[answer.author] = 0;
                    scores[answer.author] += (currentAnswers.length - index);
                });
                
                io.emit("show-results", rankedAnswers, scores);
                
                // Preparar siguiente ronda o finalizar
                currentQuestionIndex++;
                if (currentQuestionIndex < questions.length) {
                    setTimeout(() => {
                        answers = answers.filter(a => a.questionIndex < currentQuestionIndex);
                        io.emit("start-answer-phase", questions[currentQuestionIndex].text);
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
