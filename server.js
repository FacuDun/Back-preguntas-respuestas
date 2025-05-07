


// Middleware CORS para Express (HTTP)
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://facudun.github.io",
    "https://facudun.github.io/Front-pregunta-respuesta",
    "https://facudun.github.io/Front-pregunta-respuesta/",
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST");
  }
  next();
});

// Configuración CORS para Socket.io
const io = new Server(server, {
  cors: {
    origin: allowedOrigins, // Mismas URLs que arriba
    methods: ["GET", "POST"],
    credentials: true,
    transports: ["websocket", "polling"] // Fuerza ambos métodos
  }
});

// Ruta básica para probar HTTP
app.get("/", (req, res) => {
  res.send("Backend funcionando ✅");
});

// Lógica de Socket.io
io.on("connection", (socket) => {
  console.log("🔌 Conexión Socket.io exitosa ID:", socket.id);
});

// Iniciar servidor
const PORT = process.env.PORT || 10000; // Usa el puerto de Render
server.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});

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
