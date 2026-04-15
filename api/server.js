const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL
});

// Create tables on startup
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      position INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      position INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
    CREATE INDEX IF NOT EXISTS idx_responses_folder ON responses(folder_id);
  `);
  console.log('Database initialized');
}

// GET /data — returns full folder tree
app.get('/data', async (req, res) => {
  try {
    const foldersResult = await pool.query('SELECT * FROM folders ORDER BY position, created_at');
    const responsesResult = await pool.query('SELECT * FROM responses ORDER BY position, created_at');

    const allFolders = foldersResult.rows;
    const allResponses = responsesResult.rows;

    // Build tree: top-level folders (no parent)
    const topFolders = allFolders.filter(f => !f.parent_id);
    const tree = topFolders.map(folder => ({
      id: folder.id,
      name: folder.name,
      subfolders: allFolders
        .filter(sf => sf.parent_id === folder.id)
        .map(sf => ({
          id: sf.id,
          name: sf.name,
          responses: allResponses.filter(r => r.folder_id === sf.id).map(r => ({
            id: r.id, title: r.title, content: r.content
          }))
        })),
      responses: allResponses.filter(r => r.folder_id === folder.id).map(r => ({
        id: r.id, title: r.title, content: r.content
      }))
    }));

    res.json({ folders: tree });
  } catch (err) {
    console.error('GET /data error:', err);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

// POST /folders — create folder
app.post('/folders', async (req, res) => {
  try {
    const { id, name, parent_id } = req.body;
    await pool.query(
      'INSERT INTO folders (id, name, parent_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = $2, updated_at = NOW()',
      [id, name, parent_id || null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /folders error:', err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// PUT /folders/:id — update folder
app.put('/folders/:id', async (req, res) => {
  try {
    const { name } = req.body;
    await pool.query('UPDATE folders SET name = $1, updated_at = NOW() WHERE id = $2', [name, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /folders error:', err);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// DELETE /folders/:id
app.delete('/folders/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM folders WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /folders error:', err);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// POST /responses — create response
app.post('/responses', async (req, res) => {
  try {
    const { id, folder_id, title, content } = req.body;
    await pool.query(
      'INSERT INTO responses (id, folder_id, title, content) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET title = $3, content = $4, updated_at = NOW()',
      [id, folder_id, title, content]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /responses error:', err);
    res.status(500).json({ error: 'Failed to create response' });
  }
});

// PUT /responses/:id — update response (title, content, optional folder_id to move)
app.put('/responses/:id', async (req, res) => {
  try {
    const { title, content, folder_id } = req.body;
    if (folder_id !== undefined && folder_id !== null) {
      await pool.query(
        'UPDATE responses SET title = $1, content = $2, folder_id = $3, updated_at = NOW() WHERE id = $4',
        [title, content, folder_id, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE responses SET title = $1, content = $2, updated_at = NOW() WHERE id = $3',
        [title, content, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /responses error:', err);
    res.status(500).json({ error: 'Failed to update response' });
  }
});

// DELETE /responses/:id
app.delete('/responses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM responses WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /responses error:', err);
    res.status(500).json({ error: 'Failed to delete response' });
  }
});

// Health check
app.get('/', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;

initDB().then(() => {
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to init DB:', err);
  process.exit(1);
});
