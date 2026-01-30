#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const child = require('child_process');

function readJSON(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function exists(p){ return fs.existsSync(p); }
function walk(dir, cb){
  if(!exists(dir)) return;
  for(const f of fs.readdirSync(dir)){
    const fp = path.join(dir,f);
    const stat = fs.statSync(fp);
    if(stat.isDirectory()) walk(fp,cb);
    else cb(fp);
  }
}

const root = process.cwd();
const checklistPath = path.join(root, '.aicodechecklist.json');
if(!exists(checklistPath)){
  console.error('ERROR: .aicodechecklist.json not found');
  process.exit(2);
}
const checklist = readJSON(checklistPath);

let results = [];
let hasFail = false;

function fail(id, reason){
  results.push({id, status:'Fail', reason});
  hasFail = true;
}
function pass(id, reason){
  results.push({id, status:'Pass', reason});
}
function na(id, reason){
  results.push({id, status:'NeedsAttention', reason});
}

const packageJson = path.join(root,'package.json');
const packageObj = exists(packageJson) ? readJSON(packageJson) : null;

// test_exists
if(checklist.categories.some(c=>c.items.some(i=>i.id==='test_exists'))){
  const hasTests =
    exists(path.join(root,'test')) ||
    exists(path.join(root,'tests')) ||
    exists(path.join(root,'__tests__')) ||
    (packageObj && ((packageObj.scripts && packageObj.scripts.test) || (packageObj.devDependencies && packageObj.devDependencies.jest)));
  if(hasTests) pass('test_exists','Tests folder or test script detected.');
  else fail('test_exists','No tests detected (no test folder or test script).');
}

// test_checks -> try lint/test if scripts exist
if(checklist.categories.some(c=>c.items.some(i=>i.id==='test_checks'))){
  if(packageObj && packageObj.scripts && (packageObj.scripts.lint || packageObj.scripts.test || packageObj.scripts.build)){
    try{
      if(packageObj.scripts.lint){
        console.log('Running `npm run lint` (if present)...');
        child.execSync('npm run lint --silent', {stdio:'inherit', timeout: 120000});
        pass('test_checks','Lint passed.');
      } else if(packageObj.scripts.test){
        console.log('Running `npm test` (if present)...');
        child.execSync('npm test --silent', {stdio:'inherit', timeout: 120000});
        pass('test_checks','Tests passed.');
      } else {
        na('test_checks','No lint/test script found to run.');
      }
    }catch(e){
      fail('test_checks','Lint/tests failed (see job logs).');
    }
  } else {
    na('test_checks','No package.json scripts to run (skipped).');
  }
}

// sec_secrets -> simple grep for common secret patterns
if(checklist.categories.some(c=>c.items.some(i=>i.id==='sec_secrets'))){
  const suspicious = [];
  walk(root, (fp) => {
    if(fp.includes('node_modules') || fp.includes('.git')) return;
    const ext = path.extname(fp).toLowerCase();
    if(['.md','.png','.jpg','.jpeg','.gif','.ico','.bin'].includes(ext)) return;
    try{
      const txt = fs.readFileSync(fp,'utf8');
      if(/(api[_-]?key|secret|password|passwd|aws_secret|aws_access|SECRET_KEY|PRIVATE_KEY|TOKEN)/i.test(txt)){
        suspicious.push(fp);
      }
    }catch(e){}
  });
  if(suspicious.length>0) fail('sec_secrets',`Potential secrets found in files: ${suspicious.slice(0,5).join(', ')}`);
  else pass('sec_secrets','No obvious hardcoded secrets found.');
}

// read_format -> look for eslint/prettier
if(checklist.categories.some(c=>c.items.some(i=>i.id==='read_format'))){
  const hasFormat = exists(path.join(root,'.eslintrc')) || exists(path.join(root,'.eslintrc.js')) || exists(path.join(root,'.prettierrc')) || (packageObj && (packageObj.devDependencies && (packageObj.devDependencies.eslint || packageObj.devDependencies.prettier)));
  if(hasFormat) pass('read_format','Formatter/linter config detected.');
  else na('read_format','No linter/formatter config found (recommend adding ESLint/Prettier).');
}

// default: mark other items as NeedsAttention (can extend)
for(const cat of checklist.categories){
  for(const item of cat.items){
    if(['test_exists','test_checks','sec_secrets','read_format'].includes(item.id)) continue;
    if(!results.find(r=>r.id===item.id)) na(item.id,'Automated check not available; manual review recommended.');
  }
}

console.log(JSON.stringify({results},null,2));

if(hasFail) {
  console.error('One or more checks failed.');
  process.exit(1);
} else {
  console.log('All automated checks passed or flagged for attention.');
  process.exit(0);
}
