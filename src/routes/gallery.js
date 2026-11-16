const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (_req, res) => {
  const projects = db
    .prepare('SELECT * FROM gallery_projects ORDER BY is_featured DESC, id DESC')
    .all();

  res.json({
    ok: true,
    projects,
  });
});

module.exports = router;
