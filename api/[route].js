// Every /api/<name> request, in one Vercel function (the Hobby plan allows
// 12 functions per deployment). The handlers live in server/routes/<name>.js;
// the dev server (vite.config.js) mounts the same handlers by name.

import checkurl from '../server/routes/checkurl.js';
import corpus from '../server/routes/corpus.js';
import health from '../server/routes/health.js';
import join from '../server/routes/join.js';
import llm from '../server/routes/llm.js';
import login from '../server/routes/login.js';
import logout from '../server/routes/logout.js';
import read from '../server/routes/read.js';
import search from '../server/routes/search.js';
import session from '../server/routes/session.js';
import shared from '../server/routes/shared.js';
import store from '../server/routes/store.js';
import users from '../server/routes/users.js';

export const ROUTES = { checkurl, corpus, health, join, llm, login, logout, read, search, session, shared, store, users };

export default async function handler(req, res) {
  const name = String(req.query?.route || '');
  const route = Object.hasOwn(ROUTES, name) ? ROUTES[name] : null;
  if (!route) {
    res.status(404).json({ error: { type: 'not_found', message: 'No such endpoint.' } });
    return;
  }
  delete req.query.route;
  return route(req, res);
}
