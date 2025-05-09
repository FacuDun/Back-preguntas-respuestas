const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["https://facudun.github.io/Front-pregunta-respuesta/",
             "https://facudun.github.io/Front-pregunta-respuesta",
            "https://facudun.github.io",
            "https://facudun.github.io/"],
    methods: ["GET", "POST"]
  }
});


// Estado del juego
const gameState = {
  players: [],
  currentPhase: 'waiting', // waiting, question, answer, vote, results, gameOver
  currentQuestion: null,
  currentAnswers: {},
  currentVotes: {},
  scores: {},
  timer: null,
  timeLeft: 0,
  questions: []
};

// Admin check
const isAdmin = (name) => name === 'Facu';

io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Unirse al juego
  socket.on('join', (name) => {
    if (gameState.players.some(player => player.name === name)) {
      socket.emit('nameTaken');
      return;
    }
    
    const player = { id: socket.id, name, isAdmin: isAdmin(name) };
    gameState.players.push(player);
    gameState.scores[name] = 0;
    
    io.emit('updatePlayers', gameState.players.map(p => p.name));
    socket.emit('joined', { 
      name, 
      isAdmin: player.isAdmin,
      gameState 
    });
    
    console.log(`${name} joined the game`);
  });
  
  // Iniciar partida (solo admin)
  socket.on('startGame', () => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && player.isAdmin) {
      startQuestionPhase();
    }
  });
  
  // Enviar pregunta
  socket.on('submitQuestion', (question) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && gameState.currentPhase === 'question') {
      gameState.questions.push({
        text: question,
        author: player.name
      });
      
      checkAllQuestionsSubmitted();
    }
  });
  
  // Enviar respuesta
socket.on('submitAnswer', (answer) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && gameState.currentPhase === 'answer') {
        gameState.currentAnswers[player.name] = answer;
        
        // DEBUG: Verificar respuestas almacenadas
        console.log(`Respuesta recibida de ${player.name}:`, answer);
        console.log("Todas las respuestas actuales:", gameState.currentAnswers);
        //
      
        checkAllAnswersSubmitted();
    }
});
  
  // Enviar voto
  socket.on('submitVote', (votedPlayer) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && gameState.currentPhase === 'vote') {
      gameState.currentVotes[player.name] = votedPlayer;
      checkAllVotesSubmitted();
    }
  });
  
  // Desconexión
  socket.on('disconnect', () => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player) {
      gameState.players = gameState.players.filter(p => p.id !== socket.id);
      io.emit('updatePlayers', gameState.players.map(p => p.name));
      console.log(`${player.name} left the game`);
    }
  });
  
  // Funciones auxiliares
  function startQuestionPhase() {
    gameState.currentPhase = 'question';
    gameState.questions = [];
    gameState.timeLeft = 60;
    
    io.emit('gamePhaseChanged', {
      phase: 'question',
      timeLeft: gameState.timeLeft
    });
    
    startTimer(() => {
      if (gameState.currentPhase === 'question') {
        checkAllQuestionsSubmitted(true);
      }
    });
  }
  
  function startAnswerPhase() {
    gameState.currentPhase = 'answer';
    gameState.currentQuestion = gameState.questions[0];
    gameState.currentAnswers = {};
    gameState.timeLeft = 30;
    
    io.emit('gamePhaseChanged', {
      phase: 'answer',
      question: gameState.currentQuestion,
      timeLeft: gameState.timeLeft
    });
    
    startTimer(() => {
      if (gameState.currentPhase === 'answer') {
        checkAllAnswersSubmitted(true);
      }
    });
  }
  
  function startVotePhase() {
    gameState.currentPhase = 'vote';
    gameState.currentVotes = {};
    gameState.timeLeft = 30;

    // DEBUG: Verificar respuestas antes de enviarlas
    console.log("Respuestas antes de filtrar:", gameState.currentAnswers);

    // Filtrar respuestas (excluyendo al autor)
    const answersToVote = {};
    for (const [player, answer] of Object.entries(gameState.currentAnswers)) {
        if (player !== gameState.currentQuestion.author) {
            answersToVote[player] = answer;
        }
    }

    // DEBUG: Verificar respuestas que se enviarán al frontend
    console.log("Respuestas para votación:", answersToVote);
    //

    io.emit('gamePhaseChanged', {
        phase: 'vote',
        answers: answersToVote,  // Asegúrate de que esto contiene las respuestas correctas
        timeLeft: gameState.timeLeft
    });

    startTimer(() => {
        if (gameState.currentPhase === 'vote') {
            checkAllVotesSubmitted(true);
        }
    });
}



  
  
function startResultsPhase() {
    gameState.currentPhase = 'results';
    
    // 1. Calcular votos para esta ronda
    const voteCounts = {};
    Object.values(gameState.currentVotes).forEach(votedPlayer => {
        voteCounts[votedPlayer] = (voteCounts[votedPlayer] || 0) + 1;
    });
    
    // 2. Actualizar puntajes globales
    Object.entries(voteCounts).forEach(([player, votes]) => {
        gameState.scores[player] = (gameState.scores[player] || 0) + votes;
    });
    
    // 3. Ordenar respuestas por votos (ranking)
    const rankedAnswers = Object.entries(gameState.currentAnswers)
        .map(([player, answer]) => ({
            player,
            answer,
            votes: voteCounts[player] || 0  // Si no recibió votos, muestra 0
        }))
        .sort((a, b) => b.votes - a.votes);
    
    // 4. Enviar datos al frontend
    io.emit('gamePhaseChanged', {
        phase: 'results',
        rankedAnswers,       // Respuestas rankeadas en esta ronda
        scores: gameState.scores,  // Tabla de puntajes actualizada
        timeLeft: 10         // 10 segundos para mostrar resultados
    });
    
    // Pasar a la siguiente pregunta después de 10 segundos
    setTimeout(() => {
        nextQuestionOrEndGame();
    }, 10000);
}
  
  function nextQuestionOrEndGame() {
    gameState.questions.shift();
    
    if (gameState.questions.length > 0) {
      startAnswerPhase();
    } else {
      endGame();
    }
  }
  
  function endGame() {
    gameState.currentPhase = 'gameOver';
    io.emit('gamePhaseChanged', {
      phase: 'gameOver',
      scores: gameState.scores
    });
  }
  
  function checkAllQuestionsSubmitted(force = false) {
    const allSubmitted = gameState.players.length === gameState.questions.length;
    if (allSubmitted || force) {
      clearTimer();
      startAnswerPhase();
    }
  }
  
  function checkAllAnswersSubmitted(force = false) {
    const playersWhoCanAnswer = gameState.players.filter(
        p => p.name !== gameState.currentQuestion.author
    ).length;
    
    const answersCount = Object.keys(gameState.currentAnswers).length;
    const allSubmitted = answersCount >= playersWhoCanAnswer;
    
    if (allSubmitted || force) {
        clearTimer();
        startVotePhase();
    }
}
  
  function checkAllVotesSubmitted(force = false) {
      const totalPlayers = gameState.players.length;
      const votesCount = Object.keys(gameState.currentVotes).length;
      
      // Todos deben votar (incluyendo al autor si así lo quieres)
      const allSubmitted = votesCount >= totalPlayers;  // Cambiado de X-1 a X
      
      if (allSubmitted || force) {
          clearTimer();
          startResultsPhase();
      }
  }
  
  function startTimer(onComplete) {
    clearTimer();
    
    gameState.timer = setInterval(() => {
      gameState.timeLeft--;
      io.emit('timerUpdate', gameState.timeLeft);
      
      if (gameState.timeLeft <= 0) {
        clearTimer();
        onComplete();
      }
    }, 1000);
  }
  
  function clearTimer() {
    if (gameState.timer) {
      clearInterval(gameState.timer);
      gameState.timer = null;
    }
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
