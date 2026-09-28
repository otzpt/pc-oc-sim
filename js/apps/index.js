// App registry. Each app: { id, title, icon (Tabler class), color, w, h, mount(body, ctx) }.
import browser from './browser.js';
import youtube from './youtube.js';
import spotify from './spotify.js';
import notepad from './notepad.js';
import stress from './stress.js';
import bench from './bench.js';
import gputuner from './gputuner.js';
import sensors from './sensors.js';
import sysinfo from './sysinfo.js';
import events from './events.js';
import simsettings from './simsettings.js';
import { doom, minecraft, hexgl } from './games.js';

export const APPS = [browser, youtube, spotify, notepad, doom, minecraft, hexgl, stress, bench, gputuner, sensors, sysinfo, events, simsettings];
