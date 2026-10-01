const express = require('../backend/node_modules/express');
const compression = require('../backend/node_modules/compression');
const path = require('path');

const app = express();
app.use(compression());
app.use(express.static(path.join(__dirname, '../frontend/dist'), {
  maxAge: '1d',
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

const PORT = 4173;
app.listen(PORT, () => {
  console.log(`Compressed preview server running at http://localhost:${PORT}`);
});
