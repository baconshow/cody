// life.js — what Claude's tool events mean to the mascot. State and clock only, no three.js and no DOM: it serves
// the page and the Node tests (tests/js/).
//
//   toolKind(name)          'terminal' (Bash, PowerShell) | 'external' (leaves the machine: web, browser,
//                           databases and other services over MCP) | 'other'
//   stateByAge(ms)          age of the last event → 'off' | 'ember' | 'energized'
//   isCodeFile(path)        the extension counts as code (.md, .txt and spreadsheets are text)
//   isCodeEdit(tool, path)  Edit, Write, MultiEdit or NotebookEdit on a code file (the server computes the same
//                           thing and sends it as the `code` boolean of each event)
//   createLife(start)       → {          start: the clock ms at which the page opened
//     register(tool, code, now)            one tool event; code = the server's boolean (an edit on a code file)
//     signal(now)                          user input (a session that showed signs of life without a tool call)
//     agentFinished()                      an agent finished
//     setOnline(v), setClaudeOpen(v)       server reachable; Claude running on the machine (/api/state)
//     read(now, out)                       fills `out` (a reused object, nothing is allocated):
//                                          { thinking, terminal, code, external, finished, online,
//                                            claudeOpen, idleSeconds (s since the last event or signal) }
//   }
// `external` and `finished` are counters: the reader compares them with the value from the previous frame to tell
// whether a new call left the machine or an agent finished (the mascot hops).

export const WINDOWS = Object.freeze({
  energized: 10_000,     // ms: an event in the last 10 s
  ember: 120_000,        // ms: an event in the last 2 min
  terminal: 5_000,       // ms: Bash or PowerShell in the last 5 s
  code: 5_000,           // ms: Edit or Write on a code file
  thinking: 10_000,      // ms: any tool call (the mascot is busy)
});

const TERMINAL = new Set(['Bash', 'PowerShell']);
const EXTERNAL = new Set(['WebFetch', 'WebSearch']);
const LOCAL_MCP = ['mcp__terminal__'];                  // an MCP server running on the machine itself does not leave it

export function toolKind(name) {
  if (typeof name !== 'string' || !name) return 'other';
  if (TERMINAL.has(name) || LOCAL_MCP.some((p) => name.startsWith(p))) return 'terminal';
  if (EXTERNAL.has(name) || name.startsWith('mcp__')) return 'external';
  return 'other';
}

export function stateByAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'off';
  if (ms <= WINDOWS.energized) return 'energized';
  if (ms <= WINDOWS.ember) return 'ember';
  return 'off';
}

// Code edits: the tools that write files and the extensions that count as code (the rest, such as .md, .txt and
// spreadsheets, is text).
const EDIT_TOOLS = Object.freeze(new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']));
const CODE_EXTENSIONS = Object.freeze(new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'pyw', 'css', 'scss', 'html', 'htm', 'json', 'jsonc', 'sql',
  'ps1', 'psm1', 'sh', 'bash', 'bat', 'cmd', 'c', 'h', 'cpp', 'hpp', 'cs', 'java', 'kt', 'go', 'rs', 'rb', 'php',
  'lua', 'swift', 'vue', 'svelte', 'yaml', 'yml', 'toml', 'xml', 'ipynb', 'dax', 'm', 'pq',
]));

export function isCodeFile(path) {
  if (typeof path !== 'string' || !path) return false;
  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 && CODE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export const isCodeEdit = (tool, path) => EDIT_TOOLS.has(tool) && isCodeFile(path);

const NEVER = -Infinity;

export function createLife(start = 0) {
  // opening the page counts as a signal: the mascot starts awake
  const st = {
    lastEvent: NEVER, lastSignal: start, lastTerminal: NEVER, lastCode: NEVER,
    external: 0, finished: 0, online: true, claudeOpen: true,
  };

  function register(tool, code, now) {
    st.lastEvent = now;
    st.lastSignal = Math.max(st.lastSignal, now);
    if (code === true) st.lastCode = now;
    const kind = toolKind(tool);
    if (kind === 'terminal') st.lastTerminal = now;
    else if (kind === 'external') st.external += 1;
  }

  function read(now, out) {
    out.thinking = now - st.lastEvent <= WINDOWS.thinking;
    out.terminal = now - st.lastTerminal <= WINDOWS.terminal;
    out.code = now - st.lastCode <= WINDOWS.code;
    out.external = st.external;
    out.finished = st.finished;
    out.online = st.online;
    out.claudeOpen = st.claudeOpen;
    out.idleSeconds = Math.max(0, (now - st.lastSignal) / 1000);
    return out;
  }

  return {
    register, read,
    signal(now) { st.lastSignal = Math.max(st.lastSignal, now); },
    agentFinished() { st.finished += 1; },
    setOnline(v) { st.online = !!v; },
    setClaudeOpen(v) { st.claudeOpen = v !== false; },
  };
}
