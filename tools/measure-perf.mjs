// Measures the production build's CPU and private memory, per duck state (Windows only).
//
//   npm run build
//   npm run perf -- --states=idle,walk,sleep,free --seconds=40 --warmup=10 --runs=2 --json=perf.json
//
// Each run launches `electron .` (the built `out/`) with BUDDY_PIN_STATE set (`free` = no pin,
// the normal behavior mix), waits for warm-up, then reads every Electron process's CPU time
// twice, `--seconds` apart, through CIM. CPU is reported as % of ONE core. Close any other
// DesktopBuddy/Electron app first: the measurement attributes processes by name and tree.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const root = resolve(import.meta.dirname, '..')
const electronExe = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')

function parseArgs() {
  const options = { states: ['idle', 'walk', 'sleep', 'free'], seconds: 40, warmup: 10, runs: 2 }
  for (const arg of process.argv.slice(2)) {
    const [key, value = ''] = arg.replace(/^--/, '').split('=')
    if (key === 'states') options.states = value.split(',').filter(Boolean)
    else if (key === 'seconds' || key === 'warmup' || key === 'runs') options[key] = Number(value)
    else if (key === 'json') options.json = value
    else throw new Error(`Unknown option ${arg}`)
  }
  return options
}

// ASCII-only PowerShell: one snapshot of every electron.exe as JSON.
const SNAPSHOT_PS1 = `
$ErrorActionPreference = 'Stop'
$t = [DateTime]::UtcNow.Ticks
$procs = @(Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" | ForEach-Object {
  [pscustomobject]@{
    pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; cmd = [string]$_.CommandLine
    cpu100ns = [int64]$_.KernelModeTime + [int64]$_.UserModeTime
  }
})
$mem = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "Name like 'electron%'" |
  ForEach-Object { [pscustomobject]@{ pid = [int]$_.IDProcess; privateBytes = [int64]$_.WorkingSetPrivate } })
[pscustomobject]@{ ticks = $t; procs = $procs; mem = $mem } | ConvertTo-Json -Depth 4 -Compress
`

function snapshot(script) {
  const out = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
    { encoding: 'utf8' },
  )
  if (out.status !== 0) throw new Error(`snapshot failed: ${out.stderr}`)
  const data = JSON.parse(out.stdout)
  return { ...data, procs: [data.procs ?? []].flat(), mem: [data.mem ?? []].flat() }
}

function treeOf(rootPid, procs) {
  const pids = new Set([rootPid])
  let grew = true
  while (grew) {
    grew = false
    for (const p of procs) {
      if (!pids.has(p.pid) && pids.has(p.ppid)) {
        pids.add(p.pid)
        grew = true
      }
    }
  }
  return procs.filter((p) => pids.has(p.pid))
}

function roleOf(proc, rootPid) {
  if (proc.pid === rootPid) return 'main'
  const type = /--type=([\w-]+)/.exec(proc.cmd)?.[1] ?? 'other'
  return type === 'gpu-process' ? 'gpu' : type
}

function electronRunning() {
  const out = spawnSync('tasklist', ['/FI', 'IMAGENAME eq electron.exe', '/NH'], {
    encoding: 'utf8',
  })
  return /electron\.exe/i.test(out.stdout)
}

async function measureOnce(state, options, script) {
  const env = { ...process.env }
  delete env.ELECTRON_RENDERER_URL // load the built pages, never a dev server
  if (state === 'free') delete env.BUDDY_PIN_STATE
  else env.BUDDY_PIN_STATE = state

  const child = spawn(electronExe, ['.'], { cwd: root, env, stdio: 'ignore' })
  try {
    await sleep(options.warmup * 1000)
    const before = snapshot(script)
    await sleep(options.seconds * 1000)
    const after = snapshot(script)

    const wallMs = (after.ticks - before.ticks) / 10_000
    const roles = {}
    for (const proc of treeOf(child.pid, after.procs)) {
      const start = before.procs.find((p) => p.pid === proc.pid)
      if (!start) continue // started mid-window: not comparable
      const cpuMs = (proc.cpu100ns - start.cpu100ns) / 10_000
      const memMb = (after.mem.find((m) => m.pid === proc.pid)?.privateBytes ?? 0) / 1024 / 1024
      const role = roleOf(proc, child.pid)
      const entry = roles[role] ?? { cpu: 0, memMb: 0, count: 0 }
      entry.cpu += (cpuMs / wallMs) * 100
      entry.memMb += memMb
      entry.count += 1
      roles[role] = entry
    }
    const total = Object.values(roles).reduce(
      (sum, r) => ({ cpu: sum.cpu + r.cpu, memMb: sum.memMb + r.memMb }),
      { cpu: 0, memMb: 0 },
    )
    return { state, wallMs, roles, total }
  } finally {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    await sleep(1500)
  }
}

const fmt = (n) => n.toFixed(2).padStart(6)

async function main() {
  if (process.platform !== 'win32') throw new Error('measure-perf is Windows-only for now')
  if (!existsSync(join(root, 'out', 'main', 'index.js'))) throw new Error('Run `npm run build`')
  if (electronRunning()) throw new Error('Another electron.exe is running: close it first')

  const options = parseArgs()
  const dir = mkdtempSync(join(tmpdir(), 'buddy-perf-'))
  const script = join(dir, 'snapshot.ps1')
  writeFileSync(script, SNAPSHOT_PS1, 'ascii')

  const results = []
  try {
    for (const state of options.states) {
      for (let run = 1; run <= options.runs; run++) {
        const result = await measureOnce(state, options, script)
        results.push(result)
        const parts = Object.entries(result.roles)
          .map(([role, r]) => `${role} ${r.cpu.toFixed(2)}%`)
          .join('  ')
        console.log(
          `${state.padEnd(5)} run ${run}: total ${fmt(result.total.cpu)}% CPU ` +
            `${result.total.memMb.toFixed(1)} MB private   (${parts})`,
        )
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  console.log('\nmean per state (% of one core, private MB):')
  for (const state of options.states) {
    const runs = results.filter((r) => r.state === state)
    const mean = (pick) => runs.reduce((sum, r) => sum + pick(r), 0) / runs.length
    const roles = [...new Set(runs.flatMap((r) => Object.keys(r.roles)))]
    const byRole = roles.map((role) => `${role} ${mean((r) => r.roles[role]?.cpu ?? 0).toFixed(2)}`)
    console.log(
      `  ${state.padEnd(5)} CPU ${fmt(mean((r) => r.total.cpu))}%  RAM ${mean((r) => r.total.memMb).toFixed(1)} MB  [${byRole.join(', ')}]`,
    )
  }
  if (options.json) writeFileSync(options.json, JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
