/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');
const crypto = require('crypto');

/** ---------------- 경로/환경 설정 (로컬 실행 전용) ---------------- **/

// 프로젝트 루트(소스 디렉토리)
const BASE_DIR = __dirname;

// 쓰기 가능한 런타임 디렉토리(프로젝트 루트 하위)
const RUNTIME_APP_DIR = BASE_DIR;
const RUNTIME_PROMPTS_DIR = path.join(RUNTIME_APP_DIR, '프롬프트');
const RUNTIME_CACHE_DIR = path.join(RUNTIME_APP_DIR, 'cache');

// 기존 코드에서 사용하던 promptsDir를 런타임 프롬프트 디렉토리로 매핑
const promptsDir = RUNTIME_PROMPTS_DIR;

/** ---------------- 유틸 함수 ---------------- **/

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

/** ---------------- 프롬프트 디렉토리 보장 ---------------- **/

// readline 인터페이스 (필요 시 재생성)
let rl = createReadline();
function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function closeReadline() {
  try {
    rl && rl.close();
  } catch {}
  rl = null;
}
function ensureReadline() {
  if (!rl) rl = createReadline();
}

function ensurePromptsDir() {
  // 런타임 앱/캐시/프롬프트 디렉토리 보장
  ensureDir(RUNTIME_APP_DIR);
  ensureDir(RUNTIME_CACHE_DIR);

  if (!fs.existsSync(RUNTIME_PROMPTS_DIR)) {
    ensureDir(RUNTIME_PROMPTS_DIR);
    console.log('📁 프롬프트 디렉토리를 생성했습니다:', RUNTIME_PROMPTS_DIR);
    console.log('💡 .txt 또는 .md 파일을 여기에 추가해주세요.');
  }
}

function getPromptFiles() {
  console.log('promptsDir::', promptsDir);
  try {
    const files = fs
      .readdirSync(promptsDir)
      .filter((file) => file.endsWith('.txt') || file.endsWith('.md'))
      .sort();
    return files;
  } catch (error) {
    console.error('❌ prompts 디렉토리를 읽을 수 없습니다:', error.message);
    return [];
  }
}

function showFileSelection(files, title = '사용 가능한 프롬프트 파일') {
  if (files.length === 0) {
    console.log('📂 prompts 디렉토리에 파일이 없습니다.');
    console.log('💡 .txt 또는 .md 파일을 prompts 디렉토리에 추가해주세요.');
    return;
  }

  console.log(`\n📋 ${title}:`);
  console.log('─'.repeat(50));
  files.forEach((file, index) => {
    console.log(`${index + 1}. ${file}`);
  });
  console.log('─'.repeat(50));
}

function generateCacheKeyFromFile(filename) {
  let fileContent = '';
  try {
    fileContent = fs.readFileSync(path.join(promptsDir, filename), 'utf-8');
  } catch (err) {
    console.error('❌ 파일을 읽는 중 오류가 발생했습니다:', err.message);
    return '';
  }
  if (!fileContent) {
    console.warn('⚠️ 파일 내용이 비어있어 캐시키를 생성하지 못했습니다.');
    return '';
  }
  const cacheKey = crypto.createHash('sha256').update(fileContent).digest('hex');
  return cacheKey;
}

/** ---------------- 메인 메뉴 ---------------- **/

function showMainMenu() {
  console.log('\n🧭 무엇을 하시겠어요?');
  console.log('='.repeat(50));
  console.log('1) 프롬프트 실행');
  console.log('2) 코드 실행');
  console.log('3) 프롬프트 닥터');
  console.log('4) 도움말');
  console.log('q) 종료');
  console.log('='.repeat(50));
}

function handleMainMenuSelection() {
  ensureReadline();
  rl.question('\n번호를 선택하세요 (또는 q로 종료): ', (answer) => {
    const v = answer.trim().toLowerCase();
    if (v === 'q') {
      console.log('👋 프로그램을 종료합니다.');
      closeReadline();
      process.exit(0);
    }
    switch (v) {
      case '1':
        promptRunFlow();
        break;
      case '2':
        codeRunFlow();
        break;
      case '3':
        promptDoctorFlow();
        break;
      case '4':
        showHelp();
        // 도움말 본 뒤 메인 메뉴로
        setTimeout(() => {
          showMainMenu();
          handleMainMenuSelection();
        }, 0);
        break;
      default:
        console.log('❌ 잘못된 번호입니다. 다시 선택해주세요.');
        handleMainMenuSelection();
    }
  });
}

/** ---------------- (1) 프롬프트 실행 ---------------- **/

function executeClaude(filename, extraMessage = '') {
  try {
    console.log(`\n🤖 Claude를 실행합니다: "${filename}"`);
    console.log('─'.repeat(50));
    const base = `${filename}를 읽고 프롬프트를 실행해줘. 프로젝트 루트는 ${BASE_DIR} 입니다.`;
    const promptText = extraMessage ? `${base}\n\n추가 지시사항: ${extraMessage}` : base;
    const command = `claude --permission-mode bypassPermissions "${promptText}"`;
    console.log(`실행 명령어: ${command}`);

    // 입력 스트림 닫고 실행 (inherit로 인터랙티브 가능)
    closeReadline();
    // CWD는 프롬프트 디렉토리
    execSync(command, { stdio: 'inherit', cwd: promptsDir });
    console.log('\n✅ Claude 실행이 완료되었습니다.');
  } catch (error) {
    console.error('❌ Claude 실행 중 오류가 발생했습니다:', error.message);
    console.log('💡 claude 명령어가 설치되어 있는지 확인해주세요.');
  } finally {
    // 다시 입력 대기 상태로 전환
    ensureReadline();
  }
}

function promptRunFlow() {
  const files = getPromptFiles();
  if (files.length === 0) {
    showFileSelection(files);
    // 메인메뉴 복귀
    showMainMenu();
    return handleMainMenuSelection();
  }
  showFileSelection(files, '프롬프트 실행할 파일');
  rl.question('\n번호를 선택하세요 (또는 q로 취소): ', (answer) => {
    if (answer.toLowerCase() === 'q') {
      showMainMenu();
      return handleMainMenuSelection();
    }
    const fileIndex = parseInt(answer, 10) - 1;
    if (Number.isNaN(fileIndex) || fileIndex < 0 || fileIndex >= files.length) {
      console.log('❌ 잘못된 번호입니다. 다시 선택해주세요.');
      return promptRunFlow();
    }

    const selectedFile = files[fileIndex];
    console.log(`\n✅ 선택된 파일: ${selectedFile}`);

    // 캐시 체크
    const cacheKey = generateCacheKeyFromFile(selectedFile);
    const cacheKeyFile = path.join(RUNTIME_CACHE_DIR, `.${selectedFile}.cacheKey`);

    let prevCacheKey = null;
    try {
      prevCacheKey = fs.readFileSync(cacheKeyFile, 'utf-8');
    } catch (err) {
      // 최초 실행 등: 무시
    }

    if (cacheKey && cacheKey === prevCacheKey) {
      console.log('🔑 캐시를 사용합니다. 프롬프트를 실행하지 않습니다.');
      console.log('🎉 빌드가 완료되었습니다');
      // 메인 메뉴 복귀
      showMainMenu();
      return handleMainMenuSelection();
    }

    // 캐시키 파일 디렉토리 보장
    ensureDir(path.dirname(cacheKeyFile));

    // 실행
    executeClaude(selectedFile);
    if (cacheKey) {
      fs.writeFileSync(cacheKeyFile, cacheKey);
    }

    // 메인 메뉴 복귀
    showMainMenu();
    handleMainMenuSelection();
  });
}

/** ---------------- (2) 코드 실행 (npm scripts) ---------------- **/

function getNpmScripts() {
  const pkgPath = path.join(BASE_DIR, 'package.json');
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const json = JSON.parse(raw);
    const scripts = json.scripts || {};
    return scripts;
  } catch (e) {
    console.error('❌ package.json을 읽을 수 없습니다:', e.message);
    return {};
  }
}

function executeNpmScript(scriptName) {
  try {
    console.log(`\n🧩 npm 스크립트 실행: ${scriptName}`);
    console.log('─'.repeat(50));
    closeReadline();
    execSync(`npm run ${scriptName}`, {
      stdio: 'inherit',
      cwd: BASE_DIR,
      env: process.env,
    });
    console.log('\n✅ npm 스크립트 실행이 완료되었습니다.');
  } catch (e) {
    console.error('❌ npm 실행 중 오류가 발생했습니다:', e.message);
    console.log('💡 npm이 설치되어 있고 package.json이 올바른지 확인해주세요.');
  } finally {
    ensureReadline();
  }
}

function codeRunFlow() {
  const scripts = getNpmScripts();
  const keys = Object.keys(scripts);
  if (keys.length === 0) {
    console.log('📦 package.json에 scripts가 없습니다.');
    showMainMenu();
    return handleMainMenuSelection();
  }

  console.log('\n📜 실행 가능한 npm scripts:');
  console.log('─'.repeat(50));
  keys.forEach((k, i) => {
    console.log(`${i + 1}. ${k}  -> ${scripts[k]}`);
  });
  console.log('─'.repeat(50));

  rl.question('\n번호를 선택하세요 (또는 q로 취소): ', (answer) => {
    if (answer.toLowerCase() === 'q') {
      showMainMenu();
      return handleMainMenuSelection();
    }
    const idx = parseInt(answer, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= keys.length) {
      console.log('❌ 잘못된 번호입니다. 다시 선택해주세요.');
      return codeRunFlow();
    }
    const chosen = keys[idx];
    executeNpmScript(chosen);

    // 메인 메뉴 복귀
    showMainMenu();
    handleMainMenuSelection();
  });
}

/** ---------------- (3) 프롬프트 닥터 ---------------- **/

function executeClaudeDoctor(filename, symptom) {
  const extra =
    `아래 프롬프트 파일을 읽고, 문제를 진단하고 수정 제안을 해주세요.\n` +
    `- 파일: ${filename}\n` +
    `- 증상/문제 설명: ${symptom}\n` +
    `가능하면 직접 수정된 버전과 변경 이유를 함께 제시해주세요. 프로젝트 루트는 ${BASE_DIR} 입니다.`;

  executeClaude(filename, extra);
}

function promptDoctorFlow() {
  const files = getPromptFiles();
  if (files.length === 0) {
    showFileSelection(files);
    showMainMenu();
    return handleMainMenuSelection();
  }
  showFileSelection(files, '프롬프트 닥터 대상 파일');
  rl.question('\n번호를 선택하세요 (또는 q로 취소): ', (answer) => {
    if (answer.toLowerCase() === 'q') {
      showMainMenu();
      return handleMainMenuSelection();
    }
    const idx = parseInt(answer, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= files.length) {
      console.log('❌ 잘못된 번호입니다. 다시 선택해주세요.');
      return promptDoctorFlow();
    }
    const selectedFile = files[idx];
    console.log(`\n🩺 선택된 파일: ${selectedFile}`);

    rl.question('어떤 증상이 있나요? (예: 지시가 모호함, 출력 품질 저하 등): ', (symptom) => {
      const s = (symptom || '').trim();
      if (!s) {
        console.log('⚠️ 증상 설명이 비어있습니다. 기본 점검을 진행합니다.');
      }
      executeClaudeDoctor(selectedFile, s || '일반 점검 및 개선');
      showMainMenu();
      handleMainMenuSelection();
    });
  });
}

/** ---------------- (4) 도움말 ---------------- **/

function showHelp() {
  console.log('\n❓ 도움말');
  console.log('─'.repeat(50));
  console.log('1) 프롬프트 실행');
  console.log('   - 프롬프트(프롬프트 디렉토리의 .txt/.md)를 선택해 Claude CLI로 실행합니다.');
  console.log('   - 동일 파일 내용으로 재실행을 막기 위해 캐시 키를 사용합니다.');
  console.log('');
  console.log('2) 코드 실행');
  console.log('   - package.json의 scripts 목록을 불러와서 선택한 항목을 npm run으로 실행합니다.');
  console.log('   - 실행 기준 경로는 프로젝트 루트(BASE_DIR)입니다:', BASE_DIR);
  console.log('');
  console.log('3) 프롬프트 닥터');
  console.log('   - 프롬프트 파일을 선택하고 증상을 입력하면, Claude가 문제를 진단/수정하도록 요청합니다.');
  console.log('   - 수정 제안과 변경 이유를 함께 받아볼 수 있습니다.');
  console.log('');
  console.log('4) 도움말');
  console.log('   - 이 설명을 다시 봅니다.');
  console.log('─'.repeat(50));
}

/** ---------------- main ---------------- **/

function main() {
  console.log('🚀 AI Auto Script');
  console.log('='.repeat(50));

  // 프롬프트/캐시 디렉토리 준비
  ensurePromptsDir();

  showMainMenu();
  handleMainMenuSelection();
}

// 프로그램 시작
if (require.main === module) {
  main();
}

module.exports = {
  getPromptFiles,
  executeClaude,
  main,
};
