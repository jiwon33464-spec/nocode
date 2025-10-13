// Windows PowerShell Base64 명령어 테스트 스크립트

const { exec } = require('child_process');

// 테스트할 프롬프트 메시지
const testPrompt = `테스트프롬프트를 읽고 프롬프트를 읽어서 코드를 만들어줘. 프로젝트 루트는 C:\\Users\\화해글로벌\\Downloads\\p-desktop\\p-desktop 입니다. 만들 코드는 루트의 코드폴더에 테스트프롬프트 폴더 내에 만들어줘. 코드를 다 작성하고 나면 package.json에 만든 코드를 실행할 수 있는 테스트프롬프트 이름과 동일한 명령어를 만들어줘.
추가적으로 프롬프트 내용에

## 구현 세부

- 코드 작성이 필요하다면 TypeScript 로 작성
- 코드가 필요하다면 Node 18 이상 환경에서 동작하는 코드
- 함수는 main() 하나로 작성 후 즉시 실행.
- 필요한 의존성이 있다면 설치
- 프로그램을 실행하면 open 모듈을 통해 포트를 실행한다.

## 수용 기준

- [ ] 파일 존재 및 형식 검사
- [ ] 로그 요약 출력
- [ ] SIGINT 안전 종료
- [ ] 에러 발생 시 메시지와 종료 코드

위 내용을 추가적으로 적용해줘.

        `;

// Base64 인코딩
const encodedPrompt = Buffer.from(testPrompt, 'utf8').toString('base64');

console.log('='.repeat(80));
console.log('📋 원본 프롬프트:');
console.log('-'.repeat(80));
console.log(testPrompt);
console.log('='.repeat(80));
console.log('\n📦 Base64 인코딩된 프롬프트:');
console.log('-'.repeat(80));
console.log(encodedPrompt);
console.log('='.repeat(80));

// 수정된 PowerShell 명령어 (Sidebar.tsx와 동일)
const fullCommand = `powershell.exe -NoProfile -NonInteractive -Command "& { $prompt = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedPrompt}')); Write-Host '=== 디코딩된 프롬프트 ===' ; Write-Host $prompt ; Write-Host '=== 프롬프트 끝 ===' }"`;

console.log('\n🔧 실행할 PowerShell 명령어:');
console.log('-'.repeat(80));
console.log(fullCommand);
console.log('='.repeat(80));

console.log('\n⚡ PowerShell 명령어 실행 중...\n');

// 명령어 실행
exec(fullCommand, {
  maxBuffer: 1024 * 1024 * 10, // 10MB buffer
  timeout: 30000,
  encoding: 'utf8'
}, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ 실행 오류:', error);
    console.error('Exit code:', error.code);
    console.error('Signal:', error.signal);
    return;
  }

  if (stderr) {
    console.error('⚠️ 경고/오류 출력:');
    console.error(stderr);
  }

  console.log('✅ 실행 결과:');
  console.log('='.repeat(80));
  console.log(stdout);
  console.log('='.repeat(80));

  // Base64 디코딩 검증
  console.log('\n🔍 디코딩 검증:');
  const decoded = Buffer.from(encodedPrompt, 'base64').toString('utf8');
  console.log('원본과 디코딩 결과가 일치:', decoded === testPrompt ? '✅ 성공' : '❌ 실패');
});
