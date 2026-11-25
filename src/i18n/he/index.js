// Hebrew dictionary, keyed by the exact English string at the call site.
// Split by area so each part stays readable; later parts win on a clash.
import common from './common.js';
import shell from './shell.js';
import thread from './thread.js';
import quests from './quests.js';
import viewsdemo from './viewsdemo.js';
import promenade from './promenade.js';
import settings from './settings.js';

export default { ...common, ...shell, ...thread, ...quests, ...viewsdemo, ...promenade, ...settings };
