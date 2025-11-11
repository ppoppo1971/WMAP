// 라이브러리 로드 확인
if (typeof DxfParser === 'undefined') {
    console.error('DxfParser 라이브러리가 로드되지 않았습니다!');
    console.error('CDN 연결을 확인하세요: https://unpkg.com/dxf-parser@1.2.1/dist/dxf-parser.min.js');
}

// JSZip 제거: Google Drive 자동 저장으로 대체

// DXF 도면 편집기 앱
class DxfPhotoEditor {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.svg = document.getElementById('svg');
        this.container = document.getElementById('canvas-container');
        
        // SVG 그룹 요소 생성
        this.svgGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.svg.appendChild(this.svgGroup);
        
        // 상태 관리
        this.dxfData = null;
        this.dxfFileName = '';
        this.photos = []; // { id, x, y, width, height, imageData, memo, fileName }
        this.viewBox = { x: 0, y: 0, width: 1000, height: 1000 };
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.selectedPhotoId = null;
        
        // 롱프레스 관련
        this.longPressTimer = null;
        this.longPressDuration = 500; // 0.5초
        this.longPressPosition = { x: 0, y: 0 };
        this.isLongPress = false;
        
        // 텍스트 관련
        this.texts = []; // { id, x, y, text, fontSize }
        
        // 핀치줌 관련
        this.isPinching = false;
        this.lastPinchDistance = 0;
        this.pinchCenter = { x: 0, y: 0 };
        
        this.init();
    }
    
    getEntityColor(entity) {
        if (!this.colorDebugCount) this.colorDebugCount = 0;
        
        let color = null;
        let source = 'default';
        
        // 1. ByLayer 확인 (colorIndex === 256 또는 colorIndex가 없는 경우)
        if (entity.colorIndex === 256 || entity.colorIndex === undefined) {
            // 레이어 색상 찾기
            if (entity.layer && this.dxfData.tables) {
                const layersObj = this.dxfData.tables.layers || this.dxfData.tables.layer;
                
                if (layersObj) {
                    let layer = null;
                    
                    // A. 직접 객체 접근 (예: layers["F0027217"])
                    if (!Array.isArray(layersObj) && typeof layersObj === 'object') {
                        layer = layersObj[entity.layer];
                        if (layer) source = 'layers[name]';
                    }
                    
                    // B. layers.layers 배열 (예: layers.layers[0].name)
                    if (!layer && layersObj.layers && Array.isArray(layersObj.layers)) {
                        layer = layersObj.layers.find(l => l.name === entity.layer);
                        if (layer) source = 'layers.layers[]';
                    }
                    
                    // C. 직접 배열 (예: layers[0].name)
                    if (!layer && Array.isArray(layersObj)) {
                        layer = layersObj.find(l => l.name === entity.layer);
                        if (layer) source = 'layers[]';
                    }
                    
                    // 레이어에서 색상 추출
                    if (layer) {
                        // colorIndex 우선
                        if (layer.colorIndex !== undefined) {
                            color = this.autocadColorIndexToHex(layer.colorIndex);
                            source += `.colorIndex(${layer.colorIndex})`;
                        }
                        // color 대체
                        else if (layer.color !== undefined) {
                            if (typeof layer.color === 'string') {
                                color = layer.color;
                            } else if (typeof layer.color === 'number') {
                                color = '#' + layer.color.toString(16).padStart(6, '0').toUpperCase();
                            }
                            source += '.color';
                        }
                    }
                }
            }
        }
        // 2. 엔티티 자체의 colorIndex 확인 (ByLayer가 아닌 경우)
        else if (entity.colorIndex !== undefined && entity.colorIndex >= 0 && entity.colorIndex < 256) {
            color = this.autocadColorIndexToHex(entity.colorIndex);
            source = `entity.colorIndex(${entity.colorIndex})`;
        }
        
        // 3. entity.color 확인 (dxf-parser가 이미 변환한 경우)
        if (!color && entity.color !== undefined && entity.color !== null) {
            if (typeof entity.color === 'string') {
                color = entity.color;
                source = 'entity.color(string)';
            } else if (typeof entity.color === 'number') {
                color = '#' + entity.color.toString(16).padStart(6, '0').toUpperCase();
                source = 'entity.color(number)';
            }
        }
        
        // 4. 기본값: 검은색
        if (!color) {
            color = '#000000';
            source = 'default';
        }
        
        // 5. 흰색이면 검은색으로 변경 (배경과 구분)
        if (color.toUpperCase() === '#FFFFFF' || color.toUpperCase() === '#FFF') {
            console.log(`⚪ 흰색→검은색: ${entity.type} layer="${entity.layer}"`);
            color = '#000000';
            source += ' → white→black';
        }
        
        // 디버깅 (처음 20개)
        if (this.colorDebugCount < 20) {
            console.log(`🎨 [${this.colorDebugCount}] ${entity.type} → ${color} (출처: ${source})`);
            console.log(`   colorIndex=${entity.colorIndex}, layer="${entity.layer}"`);
            this.colorDebugCount++;
        }
        
        return color;
    }
    
    autocadColorIndexToHex(colorIndex) {
        // AutoCAD 표준 색상 팔레트 (256색)
        // dxf-parser 라이브러리의 색상 팔레트와 동일
        const autocadColors = [
            0x000000, 0xFF0000, 0xFFFF00, 0x00FF00, 0x00FFFF, 0x0000FF, 0xFF00FF, 0xFFFFFF,
            0x414141, 0x808080, 0xFF0000, 0xFFAAAA, 0xBD0000, 0xBD7E7E, 0x810000, 0x815656,
            0x680000, 0x684545, 0x4F0000, 0x4F3535, 0xFF3F00, 0xFFBFAA, 0xBD2E00, 0xBD8D7E,
            0x811F00, 0x816056, 0x681900, 0x684E45, 0x4F1300, 0x4F3B35, 0xFF7F00, 0xFFD4AA,
            0xBD5E00, 0xBD9D7E, 0x814000, 0x816B56, 0x683400, 0x685645, 0x4F2700, 0x4F4235,
            0xFFBF00, 0xFFEAAA, 0xBD8D00, 0xBDAD7E, 0x816000, 0x817656, 0x684E00, 0x685F45,
            0x4F3B00, 0x4F4935, 0xFFFF00, 0xFFFFAA, 0xBDBD00, 0xBDBD7E, 0x818100, 0x818156,
            0x686800, 0x686845, 0x4F4F00, 0x4F4F35, 0xBFFF00, 0xEAFFAA, 0x8DBD00, 0xADBD7E,
            0x608100, 0x768156, 0x4E6800, 0x5F6845, 0x3B4F00, 0x494F35, 0x7FFF00, 0xD4FFAA,
            0x5EBD00, 0x9DBD7E, 0x408100, 0x6B8156, 0x346800, 0x566845, 0x274F00, 0x424F35,
            0x3FFF00, 0xBFFFAA, 0x2EBD00, 0x8DBD7E, 0x1F8100, 0x608156, 0x196800, 0x4E6845,
            0x134F00, 0x3B4F35, 0x00FF00, 0xAAFFAA, 0x00BD00, 0x7EBD7E, 0x008100, 0x568156,
            0x006800, 0x456845, 0x004F00, 0x354F35, 0x00FF3F, 0xAAFFBF, 0x00BD2E, 0x7EBD8D,
            0x00811F, 0x568160, 0x006819, 0x45684E, 0x004F13, 0x354F3B, 0x00FF7F, 0xAAFFD4,
            0x00BD5E, 0x7EBD9D, 0x008140, 0x56816B, 0x006834, 0x456856, 0x004F27, 0x354F42,
            0x00FFBF, 0xAAFFEA, 0x00BD8D, 0x7EBDAD, 0x008160, 0x568176, 0x00684E, 0x45685F,
            0x004F3B, 0x354F49, 0x00FFFF, 0xAAFFFF, 0x00BDBD, 0x7EBDBD, 0x008181, 0x568181,
            0x006868, 0x456868, 0x004F4F, 0x354F4F, 0x00BFFF, 0xAAEAFF, 0x008DBD, 0x7EADBD,
            0x006081, 0x567681, 0x004E68, 0x455F68, 0x003B4F, 0x35494F, 0x007FFF, 0xAAD4FF,
            0x005EBD, 0x7E9DBD, 0x004081, 0x566B81, 0x003468, 0x455668, 0x00274F, 0x35424F,
            0x003FFF, 0xAABFFF, 0x002EBD, 0x7E8DBD, 0x001F81, 0x566081, 0x001968, 0x454E68,
            0x00134F, 0x353B4F, 0x0000FF, 0xAAAAFF, 0x0000BD, 0x7E7EBD, 0x000081, 0x565681,
            0x000068, 0x454568, 0x00004F, 0x35354F, 0x3F00FF, 0xBFAAFF, 0x2E00BD, 0x8D7EBD,
            0x1F0081, 0x605681, 0x190068, 0x4E4568, 0x13004F, 0x3B354F, 0x7F00FF, 0xD4AAFF,
            0x5E00BD, 0x9D7EBD, 0x400081, 0x6B5681, 0x340068, 0x564568, 0x27004F, 0x42354F,
            0xBF00FF, 0xEAAAFF, 0x8D00BD, 0xAD7EBD, 0x600081, 0x765681, 0x4E0068, 0x5F4568,
            0x3B004F, 0x49354F, 0xFF00FF, 0xFFAAFF, 0xBD00BD, 0xBD7EBD, 0x810081, 0x815681,
            0x680068, 0x684568, 0x4F004F, 0x4F354F, 0xFF00BF, 0xFFAAEA, 0xBD008D, 0xBD7EAD,
            0x810060, 0x815676, 0x68004E, 0x68455F, 0x4F003B, 0x4F3549, 0xFF007F, 0xFFAAD4,
            0xBD005E, 0xBD7E9D, 0x810040, 0x81566B, 0x680034, 0x684556, 0x4F0027, 0x4F3542,
            0xFF003F, 0xFFAABF, 0xBD002E, 0xBD7E8D, 0x81001F, 0x815660, 0x680019, 0x68454E,
            0x4F0013, 0x4F353B, 0x333333, 0x505050, 0x696969, 0x828282, 0xBEBEBE, 0xFFFFFF
        ];
        
        // 유효성 검사
        if (typeof colorIndex !== 'number' || colorIndex < 0 || colorIndex >= 256) {
            console.warn(`⚠️ 잘못된 colorIndex: ${colorIndex}, 기본값(검은색) 반환`);
            return '#000000';
        }
        
        // 배열 길이 확인 (디버깅용, 첫 실행 시에만)
        if (!this._colorArrayChecked) {
            console.log(`✅ AutoCAD 색상 팔레트 크기: ${autocadColors.length}개`);
            this._colorArrayChecked = true;
        }
        
        const rgb = autocadColors[colorIndex];
        const hex = '#' + rgb.toString(16).padStart(6, '0').toUpperCase();
        
        return hex;
    }
    
    hslToHex(h, s, l) {
        l /= 100;
        const a = s * Math.min(l, 1 - l) / 100;
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }
    
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.drawWelcomeScreen();
    }
    
    setupCanvas() {
        const updateCanvasSize = () => {
            const rect = this.container.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            this.redraw();
        };
        
        updateCanvasSize();
        window.addEventListener('resize', updateCanvasSize);
    }
    
    setupEventListeners() {
        // DXF 파일 열기
        document.getElementById('dxf-input').addEventListener('change', (e) => {
            this.loadDxfFile(e.target.files[0]);
        });
        
        // 사진 추가
        document.getElementById('photo-input').addEventListener('change', (e) => {
            this.addPhoto(e.target.files[0]);
        });
        
        // 내보내기 버튼 제거됨 (Google Drive 자동 저장 사용)
        
        // SVG 드래그 (팬) - SVG에서 이벤트 받기
        this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.svg.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.svg.addEventListener('mouseup', this.onMouseUp.bind(this));
        
        // 터치 이벤트 (모바일) - SVG에서
        this.svg.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.svg.addEventListener('touchmove', this.onTouchMove.bind(this));
        this.svg.addEventListener('touchend', this.onTouchEnd.bind(this));
        
        // 사진 클릭 - Canvas에서
        this.canvas.addEventListener('click', this.onCanvasClick.bind(this));
        this.canvas.style.pointerEvents = 'auto'; // 사진 클릭 위해 활성화
        
        // 줌 버튼
        document.getElementById('zoom-in').addEventListener('click', () => {
            this.zoom(1.2);
        });
        
        document.getElementById('zoom-out').addEventListener('click', () => {
            this.zoom(0.8);
        });
        
        // 전체보기 버튼
        document.getElementById('fit-btn').addEventListener('click', () => {
            console.log('🔍 전체보기 클릭');
            this.fitDxfToView();
            this.redraw();
        });
        
        // 메모 모달
        document.getElementById('close-memo').addEventListener('click', () => {
            this.closeMemoModal();
        });
        
        document.getElementById('save-memo').addEventListener('click', () => {
            this.saveMemo();
        });
        
        document.getElementById('delete-photo').addEventListener('click', () => {
            this.deletePhoto();
        });
        
        // 롱프레스 이벤트 (SVG에 추가)
        this.setupLongPressEvents();
        
        // 컨텍스트 메뉴 버튼들
        document.getElementById('camera-btn').addEventListener('click', () => {
            this.hideContextMenu();
            document.getElementById('camera-input').click();
        });
        
        document.getElementById('gallery-btn').addEventListener('click', () => {
            this.hideContextMenu();
            document.getElementById('gallery-input').click();
        });
        
        document.getElementById('text-btn').addEventListener('click', () => {
            this.hideContextMenu();
            this.showTextInputModal();
        });
        
        // 카메라/갤러리 파일 입력
        document.getElementById('camera-input').addEventListener('change', (e) => {
            this.addPhotoAt(e.target.files[0], this.longPressPosition);
            e.target.value = ''; // 초기화
        });
        
        document.getElementById('gallery-input').addEventListener('change', (e) => {
            this.addPhotoAt(e.target.files[0], this.longPressPosition);
            e.target.value = ''; // 초기화
        });
        
        // 텍스트 입력 모달
        document.getElementById('text-cancel-btn').addEventListener('click', () => {
            this.hideTextInputModal();
        });
        
        document.getElementById('text-save-btn').addEventListener('click', () => {
            this.saveTextInput();
        });
        
        // 컨텍스트 메뉴 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            const contextMenu = document.getElementById('context-menu');
            if (!contextMenu.contains(e.target) && !e.target.closest('#svg')) {
                this.hideContextMenu();
            }
        });
        
        // 사진 보기 모달 이벤트
        document.getElementById('close-photo-view').addEventListener('click', () => {
            this.closePhotoViewModal();
        });
        
        document.getElementById('edit-photo-memo-btn').addEventListener('click', () => {
            this.closePhotoViewModal();
            this.openMemoModal(this.selectedPhotoId);
        });
        
        document.getElementById('delete-photo-btn').addEventListener('click', () => {
            this.closePhotoViewModal();
            this.deletePhoto();
        });
    }
    
    /**
     * 롱프레스 이벤트 설정
     */
    setupLongPressEvents() {
        // 터치 이벤트 (모바일)
        this.svg.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.startLongPress(e.touches[0].clientX, e.touches[0].clientY);
            }
        });
        
        this.svg.addEventListener('touchmove', () => {
            this.cancelLongPress();
        });
        
        this.svg.addEventListener('touchend', () => {
            if (this.isLongPress) {
                // 롱프레스가 완료된 경우, 드래그 방지
                this.isLongPress = false;
            } else {
                this.cancelLongPress();
            }
        });
        
        // 마우스 이벤트 (데스크탑 테스트용)
        this.svg.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // 좌클릭만
                this.startLongPress(e.clientX, e.clientY);
            }
        });
        
        this.svg.addEventListener('mousemove', () => {
            if (this.longPressTimer) {
                this.cancelLongPress();
            }
        });
        
        this.svg.addEventListener('mouseup', () => {
            this.cancelLongPress();
        });
    }
    
    /**
     * 롱프레스 시작
     */
    startLongPress(clientX, clientY) {
        // 기존 타이머 취소
        this.cancelLongPress();
        
        // 스크린 좌표 저장
        this.longPressPosition.screenX = clientX;
        this.longPressPosition.screenY = clientY;
        
        // ViewBox 좌표로 변환
        const rect = this.svg.getBoundingClientRect();
        const svgX = ((clientX - rect.left) / rect.width) * this.viewBox.width + this.viewBox.x;
        const svgY = ((clientY - rect.top) / rect.height) * this.viewBox.height + this.viewBox.y;
        
        this.longPressPosition.x = svgX;
        this.longPressPosition.y = svgY;
        
        // 타이머 시작
        this.longPressTimer = setTimeout(() => {
            this.onLongPress();
        }, this.longPressDuration);
    }
    
    /**
     * 롱프레스 취소
     */
    cancelLongPress() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }
    
    /**
     * 롱프레스 완료 시 실행
     */
    onLongPress() {
        console.log('🔔 롱프레스 감지!', this.longPressPosition);
        
        this.isLongPress = true;
        this.longPressTimer = null;
        
        // 햅틱 피드백 (지원하는 경우)
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
        
        // 컨텍스트 메뉴 표시
        this.showContextMenu(this.longPressPosition.screenX, this.longPressPosition.screenY);
    }
    
    /**
     * 컨텍스트 메뉴 표시
     */
    showContextMenu(screenX, screenY) {
        const contextMenu = document.getElementById('context-menu');
        
        // 위치 설정 (화면을 벗어나지 않도록)
        const menuWidth = 200;
        const menuHeight = 180;
        
        let left = screenX;
        let top = screenY;
        
        // 오른쪽 벗어남 방지
        if (left + menuWidth > window.innerWidth) {
            left = window.innerWidth - menuWidth - 10;
        }
        
        // 아래쪽 벗어남 방지
        if (top + menuHeight > window.innerHeight) {
            top = window.innerHeight - menuHeight - 10;
        }
        
        contextMenu.style.left = left + 'px';
        contextMenu.style.top = top + 'px';
        contextMenu.classList.add('active');
    }
    
    /**
     * 컨텍스트 메뉴 숨김
     */
    hideContextMenu() {
        const contextMenu = document.getElementById('context-menu');
        contextMenu.classList.remove('active');
    }
    
    /**
     * 텍스트 입력 모달 표시
     */
    showTextInputModal() {
        const modal = document.getElementById('text-input-modal');
        const textField = document.getElementById('text-input-field');
        
        textField.value = '';
        modal.classList.add('active');
        
        // 포커스
        setTimeout(() => textField.focus(), 100);
    }
    
    /**
     * 텍스트 입력 모달 숨김
     */
    hideTextInputModal() {
        const modal = document.getElementById('text-input-modal');
        modal.classList.remove('active');
    }
    
    /**
     * 텍스트 저장
     */
    saveTextInput() {
        const textField = document.getElementById('text-input-field');
        const text = textField.value.trim();
        
        if (!text) {
            alert('텍스트를 입력하세요.');
            return;
        }
        
        // 텍스트 객체 생성
        const textObj = {
            id: Date.now(),
            x: this.longPressPosition.x,
            y: this.longPressPosition.y,
            text: text,
            fontSize: this.viewBox.width * 0.02 // ViewBox 크기의 2%
        };
        
        this.texts.push(textObj);
        
        console.log('📝 텍스트 추가:', textObj);
        
        this.hideTextInputModal();
        this.redraw();
        
        // Google Drive 자동 저장
        this.autoSave();
    }
    
    showLoading(show) {
        document.getElementById('loading').classList.toggle('active', show);
    }
    
    /**
     * Google Drive에서 가져온 텍스트로 DXF 로드
     * @param {string} text - DXF 파일 텍스트 내용
     * @param {string} fileName - 파일 이름
     */
    loadDxfFromText(text, fileName) {
        this.showLoading(true);
        
        try {
            this._parseDxf(text, fileName);
        } catch (error) {
            console.error('DXF 텍스트 로드 오류:', error);
            alert('DXF 파일 처리 실패: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    async loadDxfFile(file) {
        if (!file) return;
        
        this.showLoading(true);
        
        try {
            // 1. 파일 읽기
            const text = await file.text();
            
            this._parseDxf(text, file.name);
        } catch (error) {
            console.error('DXF 파일 로드 오류:', error);
            alert('DXF 파일을 여는데 실패했습니다.');
        } finally {
            this.showLoading(false);
        }
    }
    
    /**
     * DXF 텍스트 파싱 (공통 로직)
     * @param {string} text - DXF 텍스트
     * @param {string} fileName - 파일 이름
     */
    _parseDxf(text, fileName) {
        // 2. DXF 파일 유효성 검사
        if (!text.includes('SECTION') || !text.includes('ENTITIES')) {
            throw new Error('올바른 DXF 파일 형식이 아닙니다.');
        }
        
        // 3. DXF 버전 확인
        const versionMatch = text.match(/\$ACADVER[\s\S]*?[\r\n]\s*1[\r\n]\s*AC(\d+)/);
        const version = versionMatch ? versionMatch[1] : 'Unknown';
        console.log('DXF 버전:', version);
        
        // 4. DXF 파싱
        if (typeof DxfParser === 'undefined') {
            throw new Error('DXF 파서 라이브러리가 로드되지 않았습니다.\n\n페이지를 새로고침(F5)하거나 인터넷 연결을 확인해주세요.');
        }
        
        const parser = new DxfParser();
        this.dxfData = parser.parseSync(text);
            
        // 5. 파싱된 데이터 검증
        if (!this.dxfData) {
            throw new Error('DXF 파일 파싱에 실패했습니다.');
        }
        
        // 엔티티가 없는 경우 경고
        if (!this.dxfData.entities || this.dxfData.entities.length === 0) {
            console.warn('DXF 파일에 엔티티가 없습니다.');
            if (!confirm('도면에 그려진 내용이 없는 것 같습니다. 계속하시겠습니까?')) {
                return;
            }
        }
            
        console.log('DXF 데이터:', this.dxfData);
        console.log('엔티티 개수:', this.dxfData.entities ? this.dxfData.entities.length : 0);
        
        // 색상 정보 확인 (처음 5개 엔티티)
        if (this.dxfData.entities && this.dxfData.entities.length > 0) {
            console.log('\n🎨 엔티티 색상 정보 (처음 5개):');
            this.dxfData.entities.slice(0, 5).forEach((entity, i) => {
                console.log(`  ${i}. ${entity.type}: color=${entity.color}, colorIndex=${entity.colorIndex}`);
            });
        }
            
        // 레이어 정보 표시 (상세)
        if (this.dxfData.tables) {
            console.log('\nTables 키:', Object.keys(this.dxfData.tables));
            
            // ⭐ 새로 추가: 실제 구조 확인
            console.log('\n🔍 레이어 테이블 실제 구조:');
            const layersObj = this.dxfData.tables.layers || this.dxfData.tables.layer;
            console.log('layersObj 타입:', Array.isArray(layersObj) ? 'Array' : typeof layersObj);
            console.log('layersObj 전체:', layersObj);
            
            // ⭐ 각 가능한 구조 확인
            if (layersObj) {
                // 1. 객체인 경우
                if (!Array.isArray(layersObj) && typeof layersObj === 'object') {
                    console.log('✅ 객체 형태의 레이어 테이블');
                    Object.keys(layersObj).slice(0, 5).forEach(name => {
                        const layer = layersObj[name];
                        console.log(`  "${name}":`, layer);
                    });
                }
                
                // 2. layers 속성이 있는 경우
                if (layersObj.layers) {
                    console.log('✅ layers 속성 발견');
                    console.log('layersObj.layers 타입:', Array.isArray(layersObj.layers) ? 'Array' : typeof layersObj.layers);
                    console.log('layersObj.layers:', layersObj.layers);
                }
                
                // 3. 배열인 경우
                if (Array.isArray(layersObj)) {
                    console.log('✅ 배열 형태의 레이어 테이블');
                    layersObj.slice(0, 5).forEach((layer, i) => {
                        console.log(`  [${i}]:`, layer);
                    });
                }
            }
        }
        
        // 블록 정보 표시
        if (this.dxfData.blocks) {
            const blockNames = Object.keys(this.dxfData.blocks);
            console.log('\n📦 블록 개수:', blockNames.length);
            if (blockNames.length > 0) {
                console.log('블록 목록:', blockNames.slice(0, 10));
                blockNames.slice(0, 5).forEach(name => {
                    const block = this.dxfData.blocks[name];
                    if (block.entities) {
                        console.log(`  - ${name}: ${block.entities.length}개 엔티티`);
                    }
                });
            }
        }
        
        this.dxfFileName = fileName.replace('.dxf', '');
        
        // 캔버스 초기화
        this.photos = [];
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.colorDebugCount = 0; // 색상 디버그 카운터 리셋
        
        // DXF 렌더링
        this.fitDxfToView();
        this.redraw();
        
        // 버튼 활성화
        document.getElementById('add-photo-btn').disabled = false;
        document.getElementById('fit-btn').disabled = false;
        
        alert(`DXF 파일이 로드되었습니다!\n엔티티 개수: ${this.dxfData.entities ? this.dxfData.entities.length : 0}개`);
    }
    
    fitDxfToView() {
        if (!this.dxfData) return;
        
        // DXF 경계 계산
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let validPointCount = 0;
        
        const isValidNumber = (n) => {
            return typeof n === 'number' && !isNaN(n) && isFinite(n);
        };
        
        const processEntity = (entity) => {
            try {
                // POLYLINE vertices
                if (entity.vertices && Array.isArray(entity.vertices)) {
                    entity.vertices.forEach(v => {
                        if (v && isValidNumber(v.x) && isValidNumber(v.y)) {
                            minX = Math.min(minX, v.x);
                            minY = Math.min(minY, v.y);
                            maxX = Math.max(maxX, v.x);
                            maxY = Math.max(maxY, v.y);
                            validPointCount++;
                        }
                    });
                }
                
                // LINE startPoint, endPoint
                if (entity.startPoint && isValidNumber(entity.startPoint.x) && isValidNumber(entity.startPoint.y)) {
                    minX = Math.min(minX, entity.startPoint.x);
                    minY = Math.min(minY, entity.startPoint.y);
                    maxX = Math.max(maxX, entity.startPoint.x);
                    maxY = Math.max(maxY, entity.startPoint.y);
                    validPointCount++;
                }
                if (entity.endPoint && isValidNumber(entity.endPoint.x) && isValidNumber(entity.endPoint.y)) {
                    minX = Math.min(minX, entity.endPoint.x);
                    minY = Math.min(minY, entity.endPoint.y);
                    maxX = Math.max(maxX, entity.endPoint.x);
                    maxY = Math.max(maxY, entity.endPoint.y);
                    validPointCount++;
                }
                
                // CIRCLE, ARC center + radius
                if (entity.center && isValidNumber(entity.center.x) && isValidNumber(entity.center.y)) {
                    const radius = isValidNumber(entity.radius) ? entity.radius : 0;
                    minX = Math.min(minX, entity.center.x - radius);
                    minY = Math.min(minY, entity.center.y - radius);
                    maxX = Math.max(maxX, entity.center.x + radius);
                    maxY = Math.max(maxY, entity.center.y + radius);
                    validPointCount++;
                }
                
                // POINT, TEXT, INSERT position
                if (entity.position && isValidNumber(entity.position.x) && isValidNumber(entity.position.y)) {
                    minX = Math.min(minX, entity.position.x);
                    minY = Math.min(minY, entity.position.y);
                    maxX = Math.max(maxX, entity.position.x);
                    maxY = Math.max(maxY, entity.position.y);
                    validPointCount++;
                }
                
                // SPLINE controlPoints
                if (entity.controlPoints && Array.isArray(entity.controlPoints)) {
                    entity.controlPoints.forEach(cp => {
                        if (cp && isValidNumber(cp.x) && isValidNumber(cp.y)) {
                            minX = Math.min(minX, cp.x);
                            minY = Math.min(minY, cp.y);
                            maxX = Math.max(maxX, cp.x);
                            maxY = Math.max(maxY, cp.y);
                            validPointCount++;
                        }
                    });
                }
                
                // SOLID, 3DFACE points
                if (entity.points && Array.isArray(entity.points)) {
                    entity.points.forEach(p => {
                        if (p && isValidNumber(p.x) && isValidNumber(p.y)) {
                            minX = Math.min(minX, p.x);
                            minY = Math.min(minY, p.y);
                            maxX = Math.max(maxX, p.x);
                            maxY = Math.max(maxY, p.y);
                            validPointCount++;
                        }
                    });
                }
            } catch (error) {
                console.warn('엔티티 경계 계산 오류:', error);
            }
        };
        
        if (this.dxfData.entities) {
            this.dxfData.entities.forEach(processEntity);
        }
        
        console.log(`경계 계산: 유효한 포인트 ${validPointCount}개`);
        console.log(`경계: minX=${minX}, maxX=${maxX}, minY=${minY}, maxY=${maxY}`);
        
        // 유효한 경계가 없는 경우
        if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
            console.warn('유효한 경계를 계산할 수 없습니다. 기본 뷰 사용.');
            this.viewBox = { x: -500, y: -500, width: 1000, height: 1000 };
            return;
        }
        
        const dxfWidth = maxX - minX;
        const dxfHeight = maxY - minY;
        
        console.log(`도면 크기: ${dxfWidth} x ${dxfHeight}`);
        
        if (dxfWidth > 0 && dxfHeight > 0) {
            // 여백 추가 (10%)
            const margin = 0.1;
            const paddedWidth = dxfWidth * (1 + margin * 2);
            const paddedHeight = dxfHeight * (1 + margin * 2);
            
            // ViewBox 설정 (SVG는 Y축이 아래로 증가하므로 음수로)
            this.viewBox = {
                x: minX - dxfWidth * margin,
                y: -(maxY + dxfHeight * margin), // Y축 반전
                width: paddedWidth,
                height: paddedHeight
            };
            
            // 원본 ViewBox 저장 (확대율 계산용)
            this.originalViewBox = {...this.viewBox};
            
            console.log(`ViewBox 설정:`, this.viewBox);
        } else {
            console.warn('도면 크기가 0입니다. 기본 뷰 사용.');
            this.viewBox = { x: -500, y: -500, width: 1000, height: 1000 };
        }
    }
    
    drawWelcomeScreen() {
        this.ctx.fillStyle = '#f5f5f5';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = '#999';
        this.ctx.font = '20px -apple-system, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('DXF 파일을 열어주세요', this.canvas.width / 2, this.canvas.height / 2);
    }
    
    redraw() {
        console.log('🎨 redraw() 호출됨');
        
        if (!this.dxfData) {
            this.drawWelcomeScreen();
            this.clearCanvas();
            return;
        }
        
        console.log('📐 ViewBox:', this.viewBox);
        
        // 1. SVG로 DXF 렌더링 (벡터)
        this.drawDxfSvg();
        
        // 2. Canvas로 사진 렌더링 (래스터)
        this.drawPhotosCanvas();
        
        console.log('✅ redraw() 완료');
    }
    
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    drawDxfSvg() {
        // SVG 초기화
        while (this.svgGroup.firstChild) {
            this.svgGroup.removeChild(this.svgGroup.firstChild);
        }
        
        if (!this.dxfData || !this.dxfData.entities) return;
        
        // ViewBox 설정
        this.svg.setAttribute('viewBox', 
            `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
        
        console.log('🖊️ SVG drawDxf() 시작, 엔티티:', this.dxfData.entities.length);
        
        let drawnCount = 0;
        let errorCount = 0;
        
        this.dxfData.entities.forEach((entity, index) => {
            try {
                if (!entity || !entity.type) {
                    console.warn(`엔티티 ${index}: 타입이 없습니다.`);
                    return;
                }
                
                const element = this.createSvgElement(entity);
                if (element) {
                    this.svgGroup.appendChild(element);
                    drawnCount++;
                }
            } catch (error) {
                errorCount++;
                if (errorCount <= 5) {
                    console.error(`엔티티 ${index} 렌더링 오류:`, error);
                }
            }
        });
        
        console.log(`SVG 렌더링 완료: ${drawnCount}개 성공, ${errorCount}개 실패`);
    }
    
    createSvgElement(entity) {
        // 엔티티 타입별로 SVG 요소 생성
        switch (entity.type) {
            case 'LINE':
                return this.createSvgLine(entity);
            case 'POLYLINE':
            case 'LWPOLYLINE':
                return this.createSvgPolyline(entity);
            case 'CIRCLE':
                return this.createSvgCircle(entity);
            case 'ARC':
                return this.createSvgArc(entity);
            case 'POINT':
                return this.createSvgPoint(entity);
            case 'TEXT':
            case 'MTEXT':
                return this.createSvgText(entity);
            case 'INSERT':
                return this.createSvgInsert(entity);
            case 'SPLINE':
                return this.createSvgSpline(entity);
            case 'ELLIPSE':
                return this.createSvgEllipse(entity);
            case 'SOLID':
            case '3DFACE':
                return this.createSvgSolid(entity);
            default:
                return null;
        }
    }
    
    createSvgLine(entity) {
        if (!entity.vertices || entity.vertices.length < 2) return null;
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', entity.vertices[0].x);
        line.setAttribute('y1', -entity.vertices[0].y); // Y축 반전
        line.setAttribute('x2', entity.vertices[1].x);
        line.setAttribute('y2', -entity.vertices[1].y);
        line.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        // stroke-width는 CSS에서 처리
        line.setAttribute('stroke-linecap', 'round');
        
        return line;
    }
    
    createSvgPolyline(entity) {
        if (!entity.vertices || entity.vertices.length < 2) return null;
        
        const validVertices = entity.vertices.filter(v => 
            v && typeof v.x === 'number' && typeof v.y === 'number'
        );
        
        if (validVertices.length < 2) return null;
        
        const points = validVertices.map(v => `${v.x},${-v.y}`).join(' ');
        
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', points);
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        // stroke-width는 CSS에서 강제 적용 (width 무시)
        polyline.setAttribute('stroke-linejoin', 'round');
        polyline.setAttribute('stroke-linecap', 'round');
        
        // 로그: width 속성 확인
        if (entity.width || entity.startWidth || entity.endWidth) {
            console.log(`📏 폴리선 굵기 속성: width=${entity.width}, start=${entity.startWidth}, end=${entity.endWidth} → CSS로 0.3 강제`);
        }
        
        return polyline;
    }
    
    createSvgCircle(entity) {
        if (!entity.center || !entity.radius) return null;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', entity.center.x);
        circle.setAttribute('cy', -entity.center.y);
        circle.setAttribute('r', entity.radius);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        // stroke-width는 CSS에서 처리
        
        return circle;
    }
    
    createSvgArc(entity) {
        if (!entity.center || !entity.radius) return null;
        
        // Arc를 path로 변환
        const startAngle = entity.startAngle || 0;
        const endAngle = entity.endAngle || 0;
        
        const startX = entity.center.x + entity.radius * Math.cos(startAngle);
        const startY = entity.center.y + entity.radius * Math.sin(startAngle);
        const endX = entity.center.x + entity.radius * Math.cos(endAngle);
        const endY = entity.center.y + entity.radius * Math.sin(endAngle);
        
        const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${startX} ${-startY} A ${entity.radius} ${entity.radius} 0 ${largeArc} 1 ${endX} ${-endY}`;
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        // stroke-width는 CSS에서 처리
        
        return path;
    }
    
    createSvgPoint(entity) {
        if (!entity.position) return null;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', entity.position.x);
        circle.setAttribute('cy', -entity.position.y);
        circle.setAttribute('r', '0.15'); // 매우 작게
        circle.setAttribute('fill', this.getEntityColor(entity)); // 실제 색상
        circle.setAttribute('class', 'dxf-point'); // CSS 클래스
        
        return circle;
    }
    
    createSvgText(entity) {
        if (!entity.text) return null;
        const pos = entity.startPoint || entity.position;
        if (!pos) return null;
        
        const fontSize = entity.textHeight || entity.height || 10;
        
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('fill', this.getEntityColor(entity)); // 실제 색상
        text.setAttribute('font-family', 'Arial, sans-serif');
        text.setAttribute('font-size', fontSize);
        text.textContent = entity.text;
        
        // SVG는 Y축이 아래로 증가하므로 텍스트 변환 처리
        if (entity.rotation) {
            // 회전이 있는 경우
            const rotationDeg = -entity.rotation * 180 / Math.PI; // 라디안을 각도로, 반전
            text.setAttribute('transform', 
                `translate(${pos.x}, ${-pos.y}) rotate(${rotationDeg})`);
            text.setAttribute('x', 0);
            text.setAttribute('y', 0);
        } else {
            // 회전이 없는 경우
            text.setAttribute('x', pos.x);
            text.setAttribute('y', -pos.y);
        }
        
        // 텍스트 정렬
        text.setAttribute('dominant-baseline', 'text-before-edge'); // 상단 정렬
        
        return text;
    }
    
    createSvgInsert(entity) {
        if (!entity.position || !entity.name) return null;
        
        const block = this.dxfData.blocks && this.dxfData.blocks[entity.name];
        
        if (!block || !block.entities || block.entities.length === 0) {
            return this.createSvgInsertFallback(entity);
        }
        
        // 블록 그룹 생성
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // 변환 적용
        let transform = `translate(${entity.position.x}, ${-entity.position.y})`;
        
        if (entity.rotation) {
            transform += ` rotate(${-entity.rotation})`;
        }
        
        const xScale = entity.xScale || 1;
        const yScale = entity.yScale || 1;
        if (xScale !== 1 || yScale !== 1) {
            transform += ` scale(${xScale}, ${yScale})`;
        }
        
        if (block.position) {
            transform += ` translate(${-block.position.x}, ${block.position.y})`;
        }
        
        group.setAttribute('transform', transform);
        
        // 블록 내부 엔티티 렌더링
        block.entities.forEach(blockEntity => {
            const element = this.createSvgElement(blockEntity);
            if (element) {
                group.appendChild(element);
            }
        });
        
        return group;
    }
    
    createSvgInsertFallback(entity) {
        // 블록을 찾을 수 없을 때
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        const size = 5;
        
        // 십자 표시
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', entity.position.x - size);
        line1.setAttribute('y1', -entity.position.y);
        line1.setAttribute('x2', entity.position.x + size);
        line1.setAttribute('y2', -entity.position.y);
        line1.setAttribute('stroke', '#FF6600');
        line1.setAttribute('stroke-width', '0.5'); // 얇게
        line1.setAttribute('vector-effect', 'non-scaling-stroke');
        
        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', entity.position.x);
        line2.setAttribute('y1', -entity.position.y - size);
        line2.setAttribute('x2', entity.position.x);
        line2.setAttribute('y2', -entity.position.y + size);
        line2.setAttribute('stroke', '#FF6600');
        line2.setAttribute('stroke-width', '0.5'); // 얇게
        line2.setAttribute('vector-effect', 'non-scaling-stroke');
        
        group.appendChild(line1);
        group.appendChild(line2);
        
        return group;
    }
    
    createSvgSpline(entity) {
        if (!entity.controlPoints || entity.controlPoints.length < 2) return null;
        
        const points = entity.controlPoints
            .filter(cp => cp && typeof cp.x === 'number' && typeof cp.y === 'number')
            .map(cp => `${cp.x},${-cp.y}`)
            .join(' ');
        
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', points);
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        // stroke-width는 CSS에서 처리
        
        return polyline;
    }
    
    createSvgEllipse(entity) {
        if (!entity.center || !entity.majorAxisEndPoint) return null;
        
        const cx = entity.center.x;
        const cy = -entity.center.y;
        const rx = Math.sqrt(
            Math.pow(entity.majorAxisEndPoint.x, 2) + 
            Math.pow(entity.majorAxisEndPoint.y, 2)
        );
        const ry = rx * (entity.axisRatio || 1);
        
        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.setAttribute('cx', cx);
        ellipse.setAttribute('cy', cy);
        ellipse.setAttribute('rx', rx);
        ellipse.setAttribute('ry', ry);
        ellipse.setAttribute('fill', 'none');
        ellipse.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        // stroke-width는 CSS에서 처리
        
        return ellipse;
    }
    
    createSvgSolid(entity) {
        if (!entity.points || entity.points.length < 3) return null;
        
        const points = entity.points
            .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number')
            .map(p => `${p.x},${-p.y}`)
            .join(' ');
        
        const color = this.getEntityColor(entity);
        
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', points);
        polygon.setAttribute('fill', color + '40'); // 25% 투명도
        polygon.setAttribute('stroke', color); // 실제 색상
        // stroke-width는 CSS에서 처리
        
        return polygon;
    }
    
    drawPhotosCanvas() {
        // Canvas 초기화 (투명)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 사진 마커 그리기
        this.drawPhotos();
        
        // 텍스트 그리기
        this.drawTexts();
    }
    
    /**
     * 텍스트 그리기
     */
    drawTexts() {
        const rect = this.svg.getBoundingClientRect();
        
        this.texts.forEach(textObj => {
            // ViewBox 좌표 → 스크린 좌표 변환
            const x = ((textObj.x - this.viewBox.x) / this.viewBox.width) * rect.width;
            const y = ((textObj.y - this.viewBox.y) / this.viewBox.height) * rect.height;
            const fontSize = (textObj.fontSize / this.viewBox.width) * rect.width;
            
            this.ctx.save();
            
            // 텍스트 스타일
            this.ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
            this.ctx.fillStyle = '#FF3B30'; // 빨간색 (잘 보이게)
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // 텍스트 배경 (가독성 향상)
            const textWidth = this.ctx.measureText(textObj.text).width;
            const padding = 5;
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            this.ctx.fillRect(x - textWidth / 2 - padding, y - fontSize / 2 - padding, 
                             textWidth + padding * 2, fontSize + padding * 2);
            
            // 텍스트 그리기
            this.ctx.fillStyle = '#FF3B30';
            this.ctx.fillText(textObj.text, x, y);
            
            this.ctx.restore();
        });
    }
    
    // 기존 Canvas 렌더링 함수들은 제거됨 (SVG로 대체)
    
    /**
     * 사진을 이모지(📷)로 표시
     */
    drawPhotos() {
        const rect = this.svg.getBoundingClientRect();
        
        this.photos.forEach(photo => {
            // ViewBox 좌표 → 스크린 좌표 변환
            const centerX = ((photo.x + photo.width / 2 - this.viewBox.x) / this.viewBox.width) * rect.width;
            const centerY = ((photo.y + photo.height / 2 - this.viewBox.y) / this.viewBox.height) * rect.height;
            
            // 이모지 크기 (ViewBox에 비례)
            const emojiSize = Math.max(40, (photo.width / this.viewBox.width) * rect.width);
            
            this.ctx.save();
            
            // 배경 원 (하얀색)
            this.ctx.fillStyle = 'white';
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, emojiSize / 2 + 5, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 테두리 (파란색)
            this.ctx.strokeStyle = '#007AFF';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
            
            // 카메라 이모지 표시
            this.ctx.font = `${emojiSize}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('📷', centerX, centerY);
            
            // 메모 아이콘 (메모가 있는 경우)
            if (photo.memo && photo.memo.trim()) {
                this.ctx.font = `${emojiSize * 0.4}px Arial`;
                this.ctx.fillText('📝', centerX + emojiSize / 2, centerY - emojiSize / 2);
            }
            
            this.ctx.restore();
        });
    }
    
    /**
     * 특정 위치에 사진 추가
     * @param {File} file - 이미지 파일
     * @param {Object} position - {x, y} ViewBox 좌표
     */
    async addPhotoAt(file, position) {
        if (!file) return;
        
        this.showLoading(true);
        
        try {
            // 이미지 로드
            const imageData = await this.readFileAsDataURL(file);
            const image = await this.loadImage(imageData);
            
            // 사진 크기를 ViewBox 크기의 10%로 설정
            const photoWidth = this.viewBox.width * 0.1;
            const photoHeight = (image.height / image.width) * photoWidth;
            
            const photo = {
                id: Date.now(),
                x: position.x - photoWidth / 2,
                y: position.y - photoHeight / 2,
                width: photoWidth,
                height: photoHeight,
                imageData: imageData,
                image: image,
                memo: '',
                fileName: file.name
            };
            
            this.photos.push(photo);
            this.redraw();
            
            console.log('📷 사진 추가 완료:', photo.fileName);
            
            // Google Drive 자동 저장
            this.autoSave();
            
        } catch (error) {
            console.error('사진 추가 오류:', error);
            alert('사진을 추가하는데 실패했습니다.');
        } finally {
            this.showLoading(false);
        }
    }
    
    async addPhoto(file) {
        if (!file) return;
        
        // ViewBox 중앙 계산
        const viewCenterX = this.viewBox.x + this.viewBox.width / 2;
        const viewCenterY = this.viewBox.y + this.viewBox.height / 2;
        
        await this.addPhotoAt(file, { x: viewCenterX, y: viewCenterY });
    }
    
    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }
    
    onMouseDown(e) {
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragStartViewBox = {...this.viewBox};
    }
    
    onMouseMove(e) {
        if (!this.isDragging) return;
        
        const rect = this.svg.getBoundingClientRect();
        const dx = (e.clientX - this.dragStartX) * (this.viewBox.width / rect.width);
        const dy = (e.clientY - this.dragStartY) * (this.viewBox.height / rect.height);
        
        this.viewBox = {
            x: this.dragStartViewBox.x - dx,
            y: this.dragStartViewBox.y - dy,
            width: this.viewBox.width,
            height: this.viewBox.height
        };
        
        this.redraw();
    }
    
    onMouseUp(e) {
        this.isDragging = false;
    }
    
    /**
     * 터치 시작 이벤트 (핀치줌 지원)
     */
    onTouchStart(e) {
        if (e.touches.length === 1) {
            // 단일 터치: 팬(드래그)
            const touch = e.touches[0];
            this.isDragging = true;
            this.dragStartX = touch.clientX;
            this.dragStartY = touch.clientY;
            this.dragStartViewBox = {...this.viewBox};
            this.isPinching = false;
        } else if (e.touches.length === 2) {
            // 두 손가락: 핀치줌
            e.preventDefault();
            this.isPinching = true;
            this.isDragging = false;
            
            // 두 손가락 사이 거리 계산
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            this.lastPinchDistance = this.getTouchDistance(touch1, touch2);
            
            // 핀치 중심점 계산 (두 손가락의 중간)
            const rect = this.svg.getBoundingClientRect();
            const centerScreenX = (touch1.clientX + touch2.clientX) / 2;
            const centerScreenY = (touch1.clientY + touch2.clientY) / 2;
            
            // 스크린 좌표 → ViewBox 좌표 변환
            this.pinchCenter.x = ((centerScreenX - rect.left) / rect.width) * this.viewBox.width + this.viewBox.x;
            this.pinchCenter.y = ((centerScreenY - rect.top) / rect.height) * this.viewBox.height + this.viewBox.y;
        }
    }
    
    /**
     * 터치 이동 이벤트 (핀치줌 지원)
     */
    onTouchMove(e) {
        if (e.touches.length === 1 && this.isDragging && !this.isPinching) {
            // 단일 터치: 팬(드래그)
            e.preventDefault();
            const touch = e.touches[0];
            
            const rect = this.svg.getBoundingClientRect();
            const dx = (touch.clientX - this.dragStartX) * (this.viewBox.width / rect.width);
            const dy = (touch.clientY - this.dragStartY) * (this.viewBox.height / rect.height);
            
            this.viewBox = {
                x: this.dragStartViewBox.x - dx,
                y: this.dragStartViewBox.y - dy,
                width: this.viewBox.width,
                height: this.viewBox.height
            };
            
            this.redraw();
        } else if (e.touches.length === 2 && this.isPinching) {
            // 두 손가락: 핀치줌
            e.preventDefault();
            
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            // 현재 거리
            const currentDistance = this.getTouchDistance(touch1, touch2);
            
            // 줌 비율 계산
            const zoomFactor = this.lastPinchDistance / currentDistance;
            
            // 핀치 중심점 기준으로 줌
            this.zoomAt(this.pinchCenter.x, this.pinchCenter.y, zoomFactor);
            
            // 거리 업데이트
            this.lastPinchDistance = currentDistance;
        }
    }
    
    /**
     * 터치 종료 이벤트
     */
    onTouchEnd(e) {
        if (e.touches.length === 0) {
            this.isDragging = false;
            this.isPinching = false;
        } else if (e.touches.length === 1) {
            // 두 손가락에서 한 손가락으로 전환 시
            this.isPinching = false;
            
            // 남은 한 손가락으로 팬 재시작
            const touch = e.touches[0];
            this.isDragging = true;
            this.dragStartX = touch.clientX;
            this.dragStartY = touch.clientY;
            this.dragStartViewBox = {...this.viewBox};
        }
    }
    
    /**
     * 두 터치 포인트 사이의 거리 계산
     */
    getTouchDistance(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * 특정 점을 중심으로 줌
     */
    zoomAt(centerX, centerY, factor) {
        // 새로운 크기 계산
        let newWidth = this.viewBox.width * factor;
        let newHeight = this.viewBox.height * factor;
        
        // 최소/최대 크기 제한
        const minSize = 0.001;
        const maxSize = 1000000;
        
        newWidth = Math.max(minSize, Math.min(maxSize, newWidth));
        newHeight = Math.max(minSize, Math.min(maxSize, newHeight));
        
        // 중심점 유지하면서 ViewBox 조정
        const centerRatioX = (centerX - this.viewBox.x) / this.viewBox.width;
        const centerRatioY = (centerY - this.viewBox.y) / this.viewBox.height;
        
        this.viewBox = {
            x: centerX - newWidth * centerRatioX,
            y: centerY - newHeight * centerRatioY,
            width: newWidth,
            height: newHeight
        };
        
        this.redraw();
    }
    
    /**
     * 캔버스 클릭 이벤트 (이모지 클릭 감지)
     */
    onCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        const svgRect = this.svg.getBoundingClientRect();
        
        // 이모지 클릭 확인 (원형 영역)
        for (let i = this.photos.length - 1; i >= 0; i--) {
            const photo = this.photos[i];
            
            // 이모지 중심점 계산
            const centerX = ((photo.x + photo.width / 2 - this.viewBox.x) / this.viewBox.width) * svgRect.width;
            const centerY = ((photo.y + photo.height / 2 - this.viewBox.y) / this.viewBox.height) * svgRect.height;
            
            // 이모지 크기
            const emojiSize = Math.max(40, (photo.width / this.viewBox.width) * svgRect.width);
            const radius = emojiSize / 2 + 5;
            
            // 거리 계산 (원형 클릭 영역)
            const distance = Math.sqrt(
                Math.pow(clickX - centerX, 2) + 
                Math.pow(clickY - centerY, 2)
            );
            
            if (distance <= radius) {
                this.openPhotoViewModal(photo.id);
                return;
            }
        }
    }
    
    /**
     * 사진 보기 모달 열기
     */
    openPhotoViewModal(photoId) {
        const photo = this.photos.find(p => p.id === photoId);
        if (!photo) return;
        
        this.selectedPhotoId = photoId;
        
        // 사진 표시
        document.getElementById('photo-view-image').src = photo.imageData;
        
        // 메모 표시
        const memoDisplay = document.getElementById('photo-memo-display');
        memoDisplay.textContent = photo.memo || '';
        
        // 모달 열기
        document.getElementById('photo-view-modal').classList.add('active');
    }
    
    /**
     * 사진 보기 모달 닫기
     */
    closePhotoViewModal() {
        document.getElementById('photo-view-modal').classList.remove('active');
    }
    
    zoom(factor) {
        // ViewBox 중심점 기준으로 줌
        const centerX = this.viewBox.x + this.viewBox.width / 2;
        const centerY = this.viewBox.y + this.viewBox.height / 2;
        
        // 새로운 크기 계산
        let newWidth = this.viewBox.width / factor;
        let newHeight = this.viewBox.height / factor;
        
        // 최소/최대 크기 제한 (매우 넓은 범위로 설정)
        const minSize = 0.001; // 최대 1000배 확대
        const maxSize = 1000000; // 최대 축소
        
        newWidth = Math.max(minSize, Math.min(maxSize, newWidth));
        newHeight = Math.max(minSize, Math.min(maxSize, newHeight));
        
        // 중심점 유지하면서 ViewBox 조정
        this.viewBox = {
            x: centerX - newWidth / 2,
            y: centerY - newHeight / 2,
            width: newWidth,
            height: newHeight
        };
        
        console.log('🔍 Zoom:', factor, 'ViewBox width:', this.viewBox.width.toFixed(2), '(확대율:', (1 / (this.viewBox.width / this.originalViewBox?.width || 1)).toFixed(2) + 'x)');
        
        this.redraw();
    }
    
    openMemoModal(photoId) {
        const photo = this.photos.find(p => p.id === photoId);
        if (!photo) return;
        
        this.selectedPhotoId = photoId;
        
        document.getElementById('memo-image-preview').src = photo.imageData;
        document.getElementById('memo-text').value = photo.memo;
        document.getElementById('memo-modal').classList.add('active');
    }
    
    closeMemoModal() {
        document.getElementById('memo-modal').classList.remove('active');
        this.selectedPhotoId = null;
    }
    
    saveMemo() {
        const photo = this.photos.find(p => p.id === this.selectedPhotoId);
        if (!photo) return;
        
        photo.memo = document.getElementById('memo-text').value;
        this.closeMemoModal();
        alert('메모가 저장되었습니다!');
        
        // Google Drive 자동 저장
        this.autoSave();
    }
    
    deletePhoto() {
        if (!confirm('이 사진을 삭제하시겠습니까?')) return;
        
        this.photos = this.photos.filter(p => p.id !== this.selectedPhotoId);
        this.closeMemoModal();
        this.redraw();
        
        // Google Drive 자동 저장
        this.autoSave();
    }
    
    /**
     * Google Drive 자동 저장
     */
    autoSave() {
        // Google Drive에 데이터 저장 (비동기)
        if (typeof window.autoSaveToDrive === 'function') {
            const appData = {
                photos: this.photos,
                texts: this.texts
            };
            
            window.autoSaveToDrive(appData).catch(error => {
                console.error('자동 저장 실패:', error);
            });
        }
    }
    
    /**
     * ZIP 내보내기 기능 제거됨
     * 
     * 이유: Google Drive 자동 저장으로 대체
     * - 사진/텍스트 추가 시 자동으로 Google Drive에 업로드
     * - JSZip 라이브러리 불필요 (~100KB 절감)
     * 
     * 필요 시 아래 코드 주석 해제하고 JSZip 라이브러리 추가
     */
    
    /*
    async exportToZip() {
        if (!this.dxfData) {
            alert('DXF 파일을 먼저 로드해주세요.');
            return;
        }
        
        if (typeof JSZip === 'undefined') {
            alert('ZIP 라이브러리가 로드되지 않았습니다.');
            return;
        }
        
        // ... ZIP 생성 로직 ...
    }
    
    createModifiedDxf() {
        // DXF 수정본 생성 로직
    }
    */
    
    downloadBlob(blob, filename) {
        // iOS 감지
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        
        console.log('다운로드 환경:', {
            isIOS: isIOS,
            isSafari: isSafari,
            userAgent: navigator.userAgent
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        
        // iOS Safari 특별 처리
        if (isIOS) {
            // iOS에서는 target="_blank" 필요
            a.target = '_blank';
            
            // 파일 크기 확인
            const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
            console.log(`파일 크기: ${sizeMB}MB`);
            
            // 사용자에게 안내
            if (isSafari) {
                // Safari: 파일이 새 탭에서 열림
                console.log('iOS Safari: 파일이 새 탭에서 열립니다.');
            } else {
                // Chrome: 다운로드 폴더로 저장
                console.log('iOS Chrome: 파일이 다운로드됩니다.');
            }
        }
        
        document.body.appendChild(a);
        
        // iOS에서는 사용자 제스처 컨텍스트에서 실행되어야 함
        try {
            a.click();
        } catch (error) {
            console.error('다운로드 클릭 오류:', error);
            // 폴백: 새 창으로 열기
            window.open(url, '_blank');
        }
        
        document.body.removeChild(a);
        
        // iOS에서는 URL을 즉시 해제하면 안됨
        if (isIOS) {
            setTimeout(() => {
                URL.revokeObjectURL(url);
                console.log('URL 해제됨');
            }, 1000);
            
            // iOS 사용자 안내
            setTimeout(() => {
                if (isSafari) {
                    alert('💾 파일 저장 방법:\n\n' +
                          '1. 새 탭이 열리면 화면을 길게 터치\n' +
                          '2. "파일에 다운로드" 선택\n' +
                          '3. "파일" 앱에서 확인\n\n' +
                          '또는:\n' +
                          '공유 버튼(↑) → "파일에 저장"');
                } else {
                    alert('💾 파일이 다운로드되었습니다!\n\n' +
                          '"다운로드" 또는 "파일" 앱에서 확인하세요.');
                }
            }, 500);
        } else {
            // 데스크탑
            setTimeout(() => URL.revokeObjectURL(url), 100);
        }
    }
}

// 앱 시작
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DxfPhotoEditor();
});

