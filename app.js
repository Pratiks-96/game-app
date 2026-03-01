const express = require('express');
const morgan = require('morgan');
const promClient = require('prom-client');
const k8s = require('@kubernetes/client-node');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(morgan('combined'));

//////////////////////////////////////////////////
// Prometheus Metrics
//////////////////////////////////////////////////

promClient.collectDefaultMetrics();

const guessesCounter = new promClient.Counter({
  name: 'game_guesses_total',
  help: 'Total number of guesses made'
});

//////////////////////////////////////////////////
// Kubernetes Client
//////////////////////////////////////////////////

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.CustomObjectsApi);

const NAMESPACE = process.env.NAMESPACE || 'default';

//////////////////////////////////////////////////
// Health Endpoint (Production requirement)
//////////////////////////////////////////////////

app.get('/health', (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "game-api",
    timestamp: new Date().toISOString()
  });
});

//////////////////////////////////////////////////
// Home
//////////////////////////////////////////////////

app.get('/', (req, res) => {
  res.send(`
    <h2>🎮 Production Game API with CRD Storage</h2>
    <p>Available endpoints:</p>
    <ul>
      <li>/play/{number}</li>
      <li>/results</li>
      <li>/dashboard</li>
      <li>/metrics</li>
      <li>/health</li>
    </ul>
  `);
});

//////////////////////////////////////////////////
// Play Game Endpoint
//////////////////////////////////////////////////

app.get('/play/:number', async (req, res) => {

  try {

    const guess = parseInt(req.params.number);

    if (isNaN(guess) || guess < 1 || guess > 10) {

      return res.status(400).json({
        error: "Guess must be between 1 and 10"
      });

    }

    const target = Math.floor(Math.random() * 10) + 1;

    const result =
      guess === target
        ? "You won! 🎉"
        : `You lost! Target was ${target}`;

    guessesCounter.inc();

    const crdBody = {

      apiVersion: "games.example.com/v1",

      kind: "GameResult",

      metadata: {
        generateName: "game-result-"
      },

      spec: {

        guess,

        target,

        result,

        timestamp: new Date().toISOString()

      }

    };

    await k8sApi.createNamespacedCustomObject(

      "games.example.com",

      "v1",

      NAMESPACE,

      "gameresults",

      crdBody

    );

    res.json({

      guess,

      target,

      result,

      stored: true

    });

  }
  catch (err) {

    console.error("CRD Save Error:", err.body || err);

    res.status(500).json({

      error: "Failed to store result",

      details: err.body || err.message

    });

  }

});

//////////////////////////////////////////////////
// Get Results API
//////////////////////////////////////////////////

app.get('/results', async (req, res) => {

  try {

    const crds = await k8sApi.listNamespacedCustomObject(

      "games.example.com",

      "v1",

      NAMESPACE,

      "gameresults"

    );

    const results = crds.body.items.map(item => ({

      name: item.metadata.name,

      guess: item.spec.guess,

      target: item.spec.target,

      result: item.spec.result,

      timestamp: item.spec.timestamp

    }));

    res.json(results);

  }
  catch (err) {

    console.error("CRD Fetch Error:", err.body || err);

    res.status(500).json({

      error: "Failed to fetch results"

    });

  }

});

//////////////////////////////////////////////////
// Dashboard UI
//////////////////////////////////////////////////

app.get('/dashboard', (req, res) => {

res.send(`

<!DOCTYPE html>

<html>

<head>

<title>Game Dashboard</title>

<style>

body {

font-family: Arial;

background: #f4f6f8;

padding: 20px;

}

table {

border-collapse: collapse;

width: 100%;

background: white;

}

th, td {

padding: 12px;

border-bottom: 1px solid #ddd;

text-align: center;

}

th {

background: #4CAF50;

color: white;

}

button {

padding: 10px;

margin-bottom: 10px;

}

</style>

</head>

<body>

<h1>🎮 Game Results Dashboard</h1>

<button onclick="loadResults()">Refresh</button>

<table>

<thead>

<tr>

<th>Name</th>

<th>Guess</th>

<th>Target</th>

<th>Result</th>

<th>Time</th>

</tr>

</thead>

<tbody id="results"></tbody>

</table>

<script>

async function loadResults() {

const res = await fetch('/results');

const data = await res.json();

const tbody = document.getElementById('results');

tbody.innerHTML = '';

data.reverse().forEach(item => {

tbody.innerHTML += \`

<tr>

<td>\${item.name}</td>

<td>\${item.guess}</td>

<td>\${item.target}</td>

<td>\${item.result}</td>

<td>\${item.timestamp}</td>

</tr>

\`;

});

}

loadResults();

setInterval(loadResults, 5000);

</script>

</body>

</html>

`);

});

//////////////////////////////////////////////////
// Prometheus Metrics
//////////////////////////////////////////////////

app.get('/metrics', async (req, res) => {

res.set('Content-Type', promClient.register.contentType);

res.end(await promClient.register.metrics());

});

//////////////////////////////////////////////////
// Start Server
//////////////////////////////////////////////////

app.listen(port, () => {

console.log(\`Game API running on port \${port}\`);

});
