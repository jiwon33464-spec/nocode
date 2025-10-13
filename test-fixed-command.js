// 수정된 PowerShell 명령어 테스트

const { exec } = require('child_process');

// 테스트 프롬프트
const testPrompt = "현재 날짜와 시간을 출력하는 간단한 JavaScript 코드를 작성해줘.";

// Base64 인코딩
const encodedPrompt = Buffer.from(testPrompt, 'utf8').toString('base64');

console.log('='.repeat(80));
console.log('📋 테스트 프롬프트:', testPrompt);
console.log('📦 Base64:', encodedPrompt);
console.log('='.repeat(80));

// 수정된 PowerShell 명령어 (& { } 제거, 직접 세미콜론으로 연결)
const fullCommand = `powershell.exe -NoProfile -NonInteractive -Command "$prompt = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedPrompt}')); Write-Host '디코딩된 프롬프트:' $prompt"`;

console.log('\n🔧 실행할 PowerShell 명령어:');
console.log('-'.repeat(80));
console.log(fullCommand);
console.log('='.repeat(80));

console.log('\n⚡ PowerShell 명령어 실행 중...\n');

// 명령어 실행
exec(fullCommand, {
  maxBuffer: 1024 * 1024 * 10,
  timeout: 10000,
  encoding: 'utf8'
}, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ 실행 오류:', error.message);
    console.error('Exit code:', error.code);
    return;
  }

  if (stderr) {
    console.error('⚠️ 표준 에러:', stderr);
  }

  console.log('✅ 실행 결과:');
  console.log('='.repeat(80));
  console.log(stdout);
  console.log('='.repeat(80));

  // 디코딩 검증
  const decoded = Buffer.from(encodedPrompt, 'base64').toString('utf8');
  console.log('\n🔍 디코딩 검증:');
  console.log('원본:', testPrompt);
  console.log('디코딩:', decoded);
  console.log('일치 여부:', decoded === testPrompt ? '✅ 성공' : '❌ 실패');
});
