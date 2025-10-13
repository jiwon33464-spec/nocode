// Claude 명령어 실제 실행 테스트 (claude CLI가 설치되어 있어야 함)

const { exec } = require('child_process');

// 간단한 테스트 프롬프트
const testPrompt = "안녕하세요. 현재 시간을 알려주세요.";

// Base64 인코딩
const encodedPrompt = Buffer.from(testPrompt, 'utf8').toString('base64');

console.log('='.repeat(80));
console.log('📋 테스트 프롬프트:', testPrompt);
console.log('📦 Base64:', encodedPrompt);
console.log('='.repeat(80));

// 수정된 PowerShell 명령어 (Sidebar.tsx와 동일)
const fullCommand = `powershell.exe -NoProfile -NonInteractive -Command "& { $prompt = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedPrompt}')); claude --permission-mode bypassPermissions \`"$prompt\`" }"`;

console.log('\n🔧 실행할 명령어:');
console.log('-'.repeat(80));
console.log(fullCommand);
console.log('='.repeat(80));

console.log('\n⚡ Claude CLI 실행 중 (30초 타임아웃)...\n');

// 명령어 실행
exec(fullCommand, {
  maxBuffer: 1024 * 1024 * 10, // 10MB buffer
  timeout: 30000,
  encoding: 'utf8',
  cwd: 'C:\\Users\\화해글로벌\\Downloads\\p-desktop\\p-desktop'
}, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ 실행 오류:');
    console.error('  메시지:', error.message);
    console.error('  코드:', error.code);
    console.error('  시그널:', error.signal);

    if (error.message.includes('claude')) {
      console.error('\n💡 Claude CLI가 설치되어 있지 않을 수 있습니다.');
      console.error('   설치: npm install -g @anthropic-ai/claude-code');
    }
    return;
  }

  if (stderr) {
    console.error('⚠️ 표준 에러 출력:');
    console.error(stderr);
  }

  console.log('✅ Claude 응답:');
  console.log('='.repeat(80));
  console.log(stdout);
  console.log('='.repeat(80));
});
