# 릴리즈 가이드

## 새 버전 릴리즈 방법

### 1. 버전 업데이트

버전은 [Semantic Versioning](https://semver.org/)을 따릅니다: `MAJOR.MINOR.PATCH`

#### 버전 유형 선택

- **Patch (1.0.0 → 1.0.1)**: 버그 수정
  ```bash
  npm run version:patch
  ```

- **Minor (1.0.0 → 1.1.0)**: 새로운 기능 추가 (하위 호환)
  ```bash
  npm run version:minor
  ```

- **Major (1.0.0 → 2.0.0)**: 주요 변경 (하위 호환 깨짐)
  ```bash
  npm run version:major
  ```

### 2. Windows 배포 파일 생성

#### 자동 빌드 (권장)
```bash
npm run release:win
```

이 명령어는 다음을 수행합니다:
1. 프로젝트 빌드 (`npm run build`)
2. Windows 배포 파일 생성
3. ZIP 파일 자동 패키징

생성되는 파일: `release/nocode-{version}-win-portable.zip`

#### 수동 빌드 (문제 발생 시)
```bash
# 1. 빌드
npm run build

# 2. electron-builder 실행
npm run dist:win

# 3. ZIP 파일 생성 (PowerShell에서)
cd release
Compress-Archive -Path win-unpacked -DestinationPath nocode-1.0.1-win-portable.zip -Force
```

### 3. Git 태그 생성 및 푸시

```bash
# 현재 버전으로 Git 태그 생성 (npm version 명령어가 자동으로 생성)
git push origin main
git push origin --tags
```

### 4. GitHub Release 생성 (선택사항)

1. GitHub 저장소로 이동
2. "Releases" → "Create a new release" 클릭
3. 태그 선택 (예: v1.0.1)
4. 릴리즈 노트 작성
5. `release/nocode-{version}-win-portable.zip` 파일 업로드
6. "Publish release" 클릭

## 전체 릴리즈 워크플로우 예시

```bash
# 1. 코드 수정 후 커밋
git add .
git commit -m "fix: 한글 경로 처리 개선"

# 2. 버전 업데이트 (자동으로 git commit & tag 생성)
npm run version:patch  # 1.0.0 → 1.0.1

# 3. Windows 배포 파일 생성
npm run release:win

# 4. Git 푸시
git push origin main --tags

# 5. release 폴더의 ZIP 파일 배포
```

## 버전 관리 팁

### 변경사항 로그 작성
`CHANGELOG.md` 파일을 만들어 각 버전의 변경사항을 기록하세요:

```markdown
## [1.0.1] - 2025-10-12
### Fixed
- Windows PowerShell에서 한글 경로 처리 개선
- Claude CLI 실행 시 인코딩 문제 해결

## [1.0.0] - 2025-10-11
### Added
- 초기 릴리즈
- Electron + React 기반 데스크탑 앱
- Claude CLI 통합
```

### 빌드 전 체크리스트

- [ ] 모든 변경사항이 커밋되었는가?
- [ ] 로컬에서 `npm run start`로 정상 동작하는가?
- [ ] 터미널, 에디터, 사이드바 모두 테스트했는가?
- [ ] Windows에서 한글 경로 테스트했는가?
- [ ] `CHANGELOG.md` 업데이트했는가?

## 문제 해결

### electron-builder 에러 발생 시
```bash
# node_modules 재설치
rm -rf node_modules package-lock.json
npm install

# 다시 빌드
npm run release:win
```

### ZIP 파일이 생성되지 않는 경우
```bash
# 수동으로 ZIP 생성
cd release
powershell -Command "Compress-Archive -Path win-unpacked -DestinationPath nocode-1.0.1-win-portable.zip -Force"
```

## 배포 파일 위치

모든 배포 파일은 `release/` 폴더에 생성됩니다:

```
release/
├── nocode-1.0.1-win-portable.zip   # 배포할 ZIP 파일
├── win-unpacked/                    # 압축 해제된 앱
│   ├── electron.exe                 # 실행 파일
│   ├── resources/
│   └── ...
└── builder-debug.yml                # 빌드 로그
```

## 사용자 설치 가이드

사용자에게 제공할 설치 가이드:

1. `nocode-{version}-win-portable.zip` 다운로드
2. 원하는 위치에 압축 해제
3. `electron.exe` 실행
4. 첫 실행 시 작업 폴더 선택

**주의**: 설치 프로그램이 아닌 portable 버전이므로 압축 해제한 폴더를 삭제하면 앱이 실행되지 않습니다.
