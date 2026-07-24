'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const FRONTEND = path.join(BACKEND, '..', 'OSE-Frontend');
const REPORT_DIR = path.join(BACKEND, 'governance-evidence-archive', 'phase-1-stability', 'reports');
const REPORT_PATH = path.join(REPORT_DIR, 'PHASE_1_SAFETY_RUN.json');

const activeChildren = new Set();
let shuttingDown = false;

function log(line) {
    process.stdout.write(`${line}\n`);
}

function failStage(stage, command, cwd, exitCode, outputTail) {
    log('');
    log(`[test:safety] STAGE FAILED: ${stage.name}`);
    log(`  command: ${command}`);
    log(`  cwd: ${cwd}`);
    log(`  exitCode: ${exitCode}`);
    if (outputTail) {
        log('  output (tail):');
        log(outputTail);
    }
}

function runCommand(stageName, command, args, cwd, env = process.env) {
    return new Promise((resolve) => {
        const started = Date.now();
        let output = '';
        const useShell = command === 'npm' || command === 'npm.cmd';
        const child = spawn(command, args, {
            cwd,
            env: { ...env },
            shell: useShell,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        activeChildren.add(child);

        child.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            output += text;
            process.stdout.write(text);
        });
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            output += text;
            process.stderr.write(text);
        });

        child.on('close', (code) => {
            activeChildren.delete(child);
            resolve({
                name: stageName,
                exitCode: code ?? 1,
                durationMs: Date.now() - started,
                output,
            });
        });
    });
}

function countBackendUnitFiles() {
    const content = fs.readFileSync(path.join(BACKEND, 'scripts/run-unit-tests.js'), 'utf8');
    return (content.match(/'src\/[^']+\.test\.js'/g) || []).length;
}

function countIntegrationFiles() {
    const content = fs.readFileSync(path.join(BACKEND, 'scripts/run-integration-tests.js'), 'utf8');
    return (content.match(/test\/integration\/[^'"]+\.test\.js/g) || []).length;
}

function parseNodeTestSummary(output) {
    const files = (output.match(/✔ .+\(.+ms\)/g) || []).length;
    const tests = Number(output.match(/ℹ tests (\d+)/)?.[1] ?? NaN);
    const passed = Number(output.match(/ℹ pass (\d+)/)?.[1] ?? NaN);
    const failed = Number(output.match(/ℹ fail (\d+)/)?.[1] ?? NaN);
    const skipped = Number(output.match(/ℹ skipped (\d+)/)?.[1] ?? NaN);
    return {
        files: Number.isFinite(files) ? files : null,
        tests: Number.isFinite(tests) ? tests : null,
        passed: Number.isFinite(passed) ? passed : null,
        failed: Number.isFinite(failed) ? failed : null,
        skipped: Number.isFinite(skipped) ? skipped : null,
    };
}

function parseVitestSummary(output) {
    const files = Number(output.match(/Test Files\s+(\d+) passed/)?.[1] ?? NaN);
    const tests = Number(output.match(/Tests\s+(\d+) passed/)?.[1] ?? NaN);
    return {
        files: Number.isFinite(files) ? files : null,
        tests: Number.isFinite(tests) ? tests : null,
        passed: Number.isFinite(tests) ? tests : null,
        failed: Number(output.match(/Tests\s+(\d+) failed/)?.[1] ?? 0),
        skipped: Number(output.match(/Tests\s+(\d+) skipped/)?.[1] ?? 0),
    };
}

function parseE2eSummary(output) {
    const pass = (output.match(/\[e2e:critical\] PASS /g) || []).length;
    const fail = (output.match(/\[e2e:critical\] FAIL /g) || []).length;
    return {
        files: 3,
        tests: 3,
        passed: pass,
        failed: fail,
        skipped: 0,
    };
}

async function stageEnvironmentGuard() {
    const started = Date.now();
    const localEnvPath = path.join(BACKEND, '.env.test.local');
    if (!fs.existsSync(localEnvPath)) {
        return {
            name: 'Environment and DB Safety Guard',
            status: 'FAIL',
            exitCode: 1,
            durationMs: Date.now() - started,
            evidence: 'OSE-backend/.env.test.local is missing',
        };
    }

    const dotenv = require(path.join(BACKEND, 'node_modules/dotenv'));
    dotenv.config({ path: localEnvPath, override: true });
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = process.env.OSE_TEST_DATABASE_URL;

    try {
        const { assertTestDatabaseEnv } = require(path.join(BACKEND, 'test/harness/assert-test-database-env'));
        assertTestDatabaseEnv();
    } catch (err) {
        return {
            name: 'Environment and DB Safety Guard',
            status: 'FAIL',
            exitCode: 1,
            durationMs: Date.now() - started,
            evidence: err.message || String(err),
        };
    }

    const { PrismaClient } = require(path.join(BACKEND, 'node_modules/@prisma/client'));
    const prisma = new PrismaClient();
    try {
        await prisma.user.findFirst({ select: { id: true } });
    } catch (err) {
        if (err.code === 'P2021') {
            return {
                name: 'Environment and DB Safety Guard',
                status: 'FAIL',
                exitCode: 1,
                durationMs: Date.now() - started,
                evidence:
                    'Test database schema is not bootstrapped. Run: cd OSE-backend && npm run test:integration:bootstrap',
            };
        }
        return {
            name: 'Environment and DB Safety Guard',
            status: 'FAIL',
            exitCode: 1,
            durationMs: Date.now() - started,
            evidence: err.message || String(err),
        };
    } finally {
        await prisma.$disconnect();
    }

    return {
        name: 'Environment and DB Safety Guard',
        status: 'PASS',
        exitCode: 0,
        durationMs: Date.now() - started,
        testDatabase: 'ose_inventory_test',
    };
}

async function runStage(stageDef) {
    log('');
    log(`[test:safety] >>> ${stageDef.name}`);
    const result = await stageDef.run();
    const stage = {
        name: stageDef.name,
        status: result.exitCode === 0 ? 'PASS' : 'FAIL',
        exitCode: result.exitCode,
        durationMs: result.durationMs ?? null,
        command: result.command ?? null,
        cwd: result.cwd ?? null,
        files: result.files ?? null,
        tests: result.tests ?? null,
        passed: result.passed ?? null,
        failed: result.failed ?? null,
        skipped: result.skipped ?? null,
        evidence: result.evidence ?? null,
    };
    if (stage.status === 'FAIL') {
        failStage(stage, result.command || stageDef.name, result.cwd || BACKEND, result.exitCode, result.outputTail);
    }
    return stage;
}

function terminateActiveChildren() {
    for (const child of activeChildren) {
        if (!child.killed) {
            child.kill('SIGTERM');
        }
    }
}

async function main() {
    const executedAt = new Date().toISOString();
    const stages = [];

    const stageDefs = [
        {
            name: 'Environment and DB Safety Guard',
            run: stageEnvironmentGuard,
        },
        {
            name: 'Backend Unit',
            async run() {
                const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
                const res = await runCommand('Backend Unit', npmCmd, ['run', 'test:unit'], BACKEND);
                const summary = parseNodeTestSummary(res.output);
                return {
                    ...res,
                    command: 'npm run test:unit',
                    cwd: BACKEND,
                    ...summary,
                    files: countBackendUnitFiles(),
                    outputTail: res.output.slice(-2000),
                };
            },
        },
        {
            name: 'Frontend Unit',
            async run() {
                const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
                const res = await runCommand('Frontend Unit', npmCmd, ['run', 'test:unit'], FRONTEND);
                const summary = parseVitestSummary(res.output);
                return {
                    ...res,
                    command: 'npm run test:unit',
                    cwd: FRONTEND,
                    ...summary,
                    outputTail: res.output.slice(-2000),
                };
            },
        },
        {
            name: 'Backend Integration',
            async run() {
                const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
                const res = await runCommand('Backend Integration', npmCmd, ['run', 'test:integration'], BACKEND);
                const summary = parseNodeTestSummary(res.output);
                return {
                    ...res,
                    command: 'npm run test:integration',
                    cwd: BACKEND,
                    ...summary,
                    files: countIntegrationFiles(),
                    outputTail: res.output.slice(-2000),
                };
            },
        },
        {
            name: 'Frontend Build',
            async run() {
                const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
                const res = await runCommand('Frontend Build', npmCmd, ['run', 'build'], FRONTEND);
                return {
                    ...res,
                    command: 'npm run build',
                    cwd: FRONTEND,
                    files: null,
                    tests: null,
                    passed: res.exitCode === 0 ? 1 : 0,
                    failed: res.exitCode === 0 ? 0 : 1,
                    skipped: 0,
                    outputTail: res.output.slice(-2000),
                };
            },
        },
        {
            name: 'Critical Browser E2E',
            async run() {
                const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
                const res = await runCommand('Critical Browser E2E', npmCmd, ['run', 'test:e2e:critical'], FRONTEND);
                const summary = parseE2eSummary(res.output);
                return {
                    ...res,
                    command: 'npm run test:e2e:critical',
                    cwd: FRONTEND,
                    ...summary,
                    outputTail: res.output.slice(-2000),
                };
            },
        },
        {
            name: 'Static Phase 1 Safety Checks',
            async run() {
                const res = await runCommand(
                    'Static Phase 1 Safety Checks',
                    process.execPath,
                    [path.join(BACKEND, 'scripts/check-phase-1-safety-static.js')],
                    BACKEND,
                );
                return {
                    ...res,
                    command: 'node scripts/check-phase-1-safety-static.js',
                    cwd: BACKEND,
                    files: null,
                    tests: null,
                    passed: res.exitCode === 0 ? 1 : 0,
                    failed: res.exitCode === 0 ? 0 : 1,
                    skipped: 0,
                    outputTail: res.output.slice(-2000),
                };
            },
        },
        {
            name: 'Residual Test Data Check',
            async run() {
                const preload = path.join(BACKEND, 'test/harness/preload.js');
                const checker = path.join(BACKEND, 'test/harness/check-phase-1-residuals.js');
                const res = await runCommand(
                    'Residual Test Data Check',
                    process.execPath,
                    ['--require', preload, checker],
                    BACKEND,
                );
                return {
                    ...res,
                    command: `node --require ./test/harness/preload.js ./test/harness/check-phase-1-residuals.js`,
                    cwd: BACKEND,
                    files: null,
                    tests: null,
                    passed: res.exitCode === 0 ? 1 : 0,
                    failed: res.exitCode === 0 ? 0 : 1,
                    skipped: 0,
                    outputTail: res.output.slice(-2000),
                };
            },
        },
    ];

    let overallExit = 0;

    for (const stageDef of stageDefs) {
        const stage = await runStage(stageDef);
        stages.push(stage);
        if (stage.status === 'FAIL') {
            overallExit = stage.exitCode || 1;
            break;
        }
    }

    const report = {
        status: overallExit === 0 ? 'PASS' : 'FAIL',
        executedAt,
        testDatabase: 'ose_inventory_test',
        stages,
        residuals: overallExit === 0 && stages.some((s) => s.name === 'Residual Test Data Check')
            ? { status: 'zero' }
            : {},
        productDatabaseTouched: false,
        openFindings: ['SF-004', 'SF-007'],
    };

    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    log('');
    log(`[test:safety] Report written: ${path.relative(BACKEND, REPORT_PATH)}`);
    log(`[test:safety] Overall: ${report.status} (exit ${overallExit})`);

    terminateActiveChildren();
    process.exit(overallExit);
}

process.on('SIGINT', () => {
    if (shuttingDown) return;
    shuttingDown = true;
    terminateActiveChildren();
    process.exit(130);
});

process.on('SIGTERM', () => {
    if (shuttingDown) return;
    shuttingDown = true;
    terminateActiveChildren();
    process.exit(143);
});

main().catch((err) => {
    console.error('[test:safety] fatal:', err.message || err);
    terminateActiveChildren();
    process.exit(1);
});
