import { createRequire } from 'node:module';

const require = createRequire(new URL('../assetfactory-studio/package.json', import.meta.url));
const ts = require('typescript');

export function validateFrozenLocalSetupSource(source) {
  const file = ts.createSourceFile('setup-local.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (file.parseDiagnostics.length) throw new Error('Local setup must parse without errors');
  const compact = (node) => node.getText(file).replace(/\s+/g, '');
  const fail = (message) => { throw new Error('Local setup frozen authority: ' + message); };
  const all = [];
  const visit = (node) => { all.push(node); ts.forEachChild(node, visit); };
  visit(file);
  const declarations = all.filter(ts.isVariableDeclaration);
  const declaration = (name) => declarations.find((node) => ts.isIdentifier(node.name) && node.name.text === name);
  const major = declaration('requiredMajor');
  if (!major?.initializer || !ts.isNumericLiteral(major.initializer) || major.initializer.text !== '22') fail('Node 22 is mandatory');
  if (compact(declaration('actual')?.initializer ?? file) !== 'process.versions.node' ||
      compact(declaration('actualMajor')?.initializer ?? file) !== "Number(actual.split('.')[0])") fail('Actual Node version must be inspected');
  const runCalls = all.filter((node) => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'run');
  const topRuns = file.statements.filter((node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'run').map((node) => node.expression);
  if (runCalls.length !== 3 || topRuns.length !== 3 || runCalls.some((node, index) => node !== topRuns[index])) fail('Exactly three unconditional setup commands are required');
  const expected = [
    ['process.execPath', ['scripts/install-locked-dependencies.mjs']],
    ['process.execPath', ['scripts/verify-factory-glob-tooling.mjs']],
    ["'npm'", ['run', 'doctor']],
  ];
  topRuns.forEach((node, index) => {
    const args = node.arguments;
    if (args.length !== 3 || !ts.isStringLiteral(args[0]) || compact(args[1]).replace(/^"npm"$/, "'npm'") !== expected[index][0] ||
        !ts.isArrayLiteralExpression(args[2]) || args[2].elements.some((item) => !ts.isStringLiteral(item)) ||
        JSON.stringify(args[2].elements.map((item) => item.text)) !== JSON.stringify(expected[index][1])) fail('Install, installed proof and doctor must run in order with exact arguments');
  });
  const guard = (condition) => file.statements.find((node) => ts.isIfStatement(node) && compact(node.expression) === condition);
  const nodeGuard = guard('actualMajor!==requiredMajor');
  const prefixGuard = guard('process.env.NPM_CONFIG_PREFIX');
  for (const item of [nodeGuard, prefixGuard]) {
    if (!item || item.pos >= topRuns[0].pos || !ts.isBlock(item.thenStatement) || item.thenStatement.statements.length !== 1 ||
        !ts.isExpressionStatement(item.thenStatement.statements[0]) ||
        !ts.isCallExpression(item.thenStatement.statements[0].expression) ||
        compact(item.thenStatement.statements[0].expression.expression) !== 'fail' || item.elseStatement) fail('Node and npm-prefix failures must stop before install');
  }
  const runs = file.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'run');
  const run = runs[0];
  const spawn = all.filter((node) => ts.isCallExpression(node) && compact(node.expression) === 'spawnSync');
  if (runs.length !== 1 || !run?.body || run.body.statements.length !== 5 || spawn.length !== 1 || spawn[0].pos < run.pos || spawn[0].end > run.end ||
      compact(spawn[0]) !== "spawnSync(command,args,{stdio:'inherit',shell:process.platform==='win32'})") fail('One checked synchronous command runner is required');
  const resultStatement = run.body.statements[2];
  if (!ts.isVariableStatement(resultStatement) || resultStatement.declarationList.declarations.length !== 1 ||
      compact(resultStatement.declarationList.declarations[0].name) !== 'result' ||
      resultStatement.declarationList.declarations[0].initializer !== spawn[0] ||
      run.parameters.length !== 3 || run.parameters.map((node) => compact(node.name)).join(',') !== 'label,command,args') fail('Checked result must be the actual owned spawn result');
  const runChecks = run.body.statements.filter(ts.isIfStatement);
  if (runChecks.length !== 2 || compact(runChecks[0].expression) !== 'result.error' ||
      compact(runChecks[1].expression) !== 'result.status!==0' ||
      runChecks.some((node) => !ts.isExpressionStatement(node.thenStatement) ||
        !ts.isCallExpression(node.thenStatement.expression) ||
        compact(node.thenStatement.expression.expression) !== 'fail' || node.elseStatement)) fail('Spawn errors and nonzero exits must fail closed');
  const imported = file.statements.filter(ts.isImportDeclaration).filter((node) => node.moduleSpecifier.text === 'node:child_process');
  if (imported.length !== 1 || compact(imported[0].importClause) !== '{spawnSync}') fail('The command runner must use the owned spawnSync import');
  const failureFunctions = file.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'fail');
  const failFunction = failureFunctions[0];
  const exit = all.filter((node) => ts.isCallExpression(node) && compact(node.expression) === 'process.exit');
  if (failureFunctions.length !== 1 || !failFunction?.body || failFunction.body.statements.length !== 2 ||
      !ts.isExpressionStatement(failFunction.body.statements[1]) || failFunction.body.statements[1].expression !== exit[0] || exit.length !== 1 || exit[0].pos < failFunction.pos || exit[0].end > failFunction.end ||
      compact(exit[0]) !== 'process.exit(1)') fail('Failure must terminate with status one');
  return { nodeMajor: 22, frozenWorkspaceInstall: true, installedToolingProof: true, doctor: true, commandCount: 3 };
}
