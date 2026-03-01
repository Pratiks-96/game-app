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
  const target = Math.floor(Math.random() * 10) + 1;
  const guess = parseInt(req.params.number);
  const result = guess === target ? 'You won! 🎉' : `You lost! Target was ${target}`;

  guessesCounter.inc();

  // Store in CRD
  const crdBody = {
    apiVersion: 'games.example.com/v1',
    kind: 'GameResult',
    metadata: { generateName: 'game-result-' },
    spec: { guess, target, result }
  };
  try {
    await k8sApi.createNamespacedCustomObject(
      'games.example.com', 'v1', NAMESPACE, 'gameresults', crdBody
    );
  } catch (err) {
    console.error('Error saving CRD:', err.body || err);
  }

  res.json({ guess, target, result });
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

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

app.listen(port, () => console.log(`Game API running on port ${port}`));
