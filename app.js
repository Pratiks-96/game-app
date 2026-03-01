const express = require('express');
const morgan = require('morgan');
const promClient = require('prom-client');
const k8s = require('@kubernetes/client-node');

const app = express();
const port = process.env.PORT || 3000;

app.use(morgan('combined'));

// Prometheus metrics
promClient.collectDefaultMetrics();
const guessesCounter = new promClient.Counter({
  name: 'game_guesses_total',
  help: 'Total number of guesses made'
});

// Kubernetes client
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CustomObjectsApi);
const NAMESPACE = process.env.NAMESPACE || 'default';

app.get('/', (req, res) => {
  res.send('🎮 Production Game API with CRD Storage!');
});

app.get('/play/:number', async (req, res) => {
  try {
    const guess = parseInt(req.params.number);

    if (isNaN(guess) || guess < 1 || guess > 10) {
      return res.status(400).json({
        error: "Guess must be a number between 1 and 10"
      });
    }

    const target = Math.floor(Math.random() * 10) + 1;
    const result = guess === target
      ? 'You won! 🎉'
      : `You lost! Target was ${target}`;

    guessesCounter.inc();

    const crdBody = {
      apiVersion: 'games.example.com/v1',
      kind: 'GameResult',
      metadata: { generateName: 'game-result-' },
      spec: {
        guess,
        target,
        result,
        timestamp: new Date().toISOString()
      }
    };

    await k8sApi.createNamespacedCustomObject(
      'games.example.com',
      'v1',
      NAMESPACE,
      'gameresults',
      crdBody
    );

    res.json({ guess, target, result });

  } catch (err) {
    console.error("CRD Save Error:", err.body || err);
    res.status(500).json({
      error: "Failed to store result"
    });
  }
});

app.get('/results', async (req, res) => {
  try {
    const crds = await k8sApi.listNamespacedCustomObject(
      'games.example.com', 'v1', NAMESPACE, 'gameresults'
    );
    const results = crds.body.items.map(item => item.spec);
    res.json(results);
  } catch (err) {
    console.error('Error fetching CRDs:', err.body || err);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});
app.get('/dashboard', async (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Game Results Dashboard</title>
    <style>
      body {
        font-family: Arial;
        background: #f4f6f8;
        padding: 20px;
      }
      h1 {
        color: #333;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        background: white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
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
      tr:hover {
        background: #f1f1f1;
      }
      button {
        padding: 10px 15px;
        background: #4CAF50;
        color: white;
        border: none;
        cursor: pointer;
      }
    </style>
  </head>
  <body>

    <h1>🎮 Game Results Dashboard</h1>

    <button onclick="loadResults()">Refresh Results</button>

    <table>
      <thead>
        <tr>
          <th>Guess</th>
          <th>Target</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody id="resultsTable"></tbody>
    </table>

    <script>
      async function loadResults() {
        const res = await fetch('/results');
        const data = await res.json();

        const table = document.getElementById('resultsTable');
        table.innerHTML = '';

        data.forEach(item => {
          const row = \`
            <tr>
              <td>\${item.guess}</td>
              <td>\${item.target}</td>
              <td>\${item.result}</td>
            </tr>
          \`;
          table.innerHTML += row;
        });
      }

      loadResults();
    </script>

  </body>
  </html>
  `);
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

app.listen(port, () => console.log(`Game API running on port ${port}`));
