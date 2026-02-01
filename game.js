// 游戏状态
let gameState = {
    score: 0,
    shots: 0,
    hits: 0,
    isPlaying: false,
    handDetected: false,
    isAiming: false
};

// Three.js 场景设置
let scene, camera, renderer;
let targets = [];
let bullets = [];
let crosshair;

// Hand Detection
let detector;
let debugCanvas;
let debugCtx;
let animationFrameId;

// 手势状态
let handLandmarks = null;
let lastIndexFingerY = null;
let shootingThreshold = 0.05; // 射击阈值

// 初始化
async function init() {
    setupThreeJS();
    setupDebugCanvas();
    await setupHandDetection();
    setupEventListeners();
    createTargets();
    animate();
}

// 设置Three.js场景
function setupThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 10, 50);

    // 相机
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 1.6, 5);

    // 渲染器
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('game-canvas'),
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // 创建地面
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d2d44,
        roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    // 创建准星
    createCrosshair();
}

// 创建准星
function createCrosshair() {
    const crosshairGroup = new THREE.Group();
    
    // 水平线
    const hGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.1, 0, -0.5),
        new THREE.Vector3(0.1, 0, -0.5)
    ]);
    const hLine = new THREE.Line(hGeometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    crosshairGroup.add(hLine);

    // 垂直线
    const vGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.1, -0.5),
        new THREE.Vector3(0, 0.1, -0.5)
    ]);
    const vLine = new THREE.Line(vGeometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    crosshairGroup.add(vLine);

    // 中心点
    const dotGeometry = new THREE.CircleGeometry(0.01, 8);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.z = -0.5;
    crosshairGroup.add(dot);

    camera.add(crosshairGroup);
    crosshair = crosshairGroup;
}

// 创建靶子
function createTargets() {
    const targetCount = 5;
    const radius = 15;
    
    for (let i = 0; i < targetCount; i++) {
        const angle = (i / targetCount) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        createTarget(x, 2, z);
    }
}

// 创建单个靶子
function createTarget(x, y, z) {
    const targetGroup = new THREE.Group();
    
    // 外圈（红色）
    const outerRing = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 1.0, 32),
        new THREE.MeshStandardMaterial({ color: 0xff0000, side: THREE.DoubleSide })
    );
    targetGroup.add(outerRing);
    
    // 中圈（蓝色）
    const middleRing = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.7, 32),
        new THREE.MeshStandardMaterial({ color: 0x0000ff, side: THREE.DoubleSide })
    );
    targetGroup.add(middleRing);
    
    // 内圈（黄色）
    const innerRing = new THREE.Mesh(
        new THREE.RingGeometry(0.2, 0.4, 32),
        new THREE.MeshStandardMaterial({ color: 0xffff00, side: THREE.DoubleSide })
    );
    targetGroup.add(innerRing);
    
    // 中心点（红色）
    const center = new THREE.Mesh(
        new THREE.CircleGeometry(0.2, 32),
        new THREE.MeshStandardMaterial({ color: 0xff0000, side: THREE.DoubleSide })
    );
    targetGroup.add(center);
    
    // 背景板
    const backboard = new THREE.Mesh(
        new THREE.CircleGeometry(1.2, 32),
        new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    backboard.position.z = -0.05;
    targetGroup.add(backboard);
    
    targetGroup.position.set(x, y, z);
    targetGroup.lookAt(camera.position);
    targetGroup.userData = {
        isHit: false,
        hitTime: 0
    };
    
    scene.add(targetGroup);
    targets.push(targetGroup);
}

// 设置调试画布
function setupDebugCanvas() {
    debugCanvas = document.getElementById('debug-canvas');
    if (debugCanvas) {
        debugCtx = debugCanvas.getContext('2d');
        debugCanvas.width = 320;
        debugCanvas.height = 240;
        debugCanvas.style.position = 'absolute';
        debugCanvas.style.top = '20px';
        debugCanvas.style.right = '20px';
        debugCanvas.style.zIndex = '11';
        debugCanvas.style.border = '2px solid rgba(255, 255, 255, 0.5)';
        debugCanvas.style.borderRadius = '10px';
        debugCanvas.style.transform = 'scaleX(-1)';
    }
}

// 设置手势检测 - 使用MediaPipe Hands（旧版本，更稳定）
async function setupHandDetection() {
    const videoElement = document.getElementById('video');
    
    // 获取摄像头流
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        });
        videoElement.srcObject = stream;
        
        // 等待视频加载完成
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                resolve();
            };
        });
        
        updateHandStatus('摄像头已启动，正在加载模型...');
    } catch (err) {
        console.error('无法访问摄像头:', err);
        updateHandStatus('无法访问摄像头，请检查权限');
        return;
    }
    
    // 等待MediaPipe库加载完成
    let retries = 0;
    const maxRetries = 100; // 等待10秒
    
    while ((typeof Hands === 'undefined' || typeof Camera === 'undefined') && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }
    
    if (typeof Hands === 'undefined') {
        console.error('MediaPipe Hands库未加载');
        updateHandStatus('MediaPipe库加载失败，请检查网络连接');
        return;
    }
    
    if (typeof Camera === 'undefined') {
        console.error('MediaPipe Camera工具类未加载');
        updateHandStatus('Camera工具类加载失败');
        return;
    }
    
    // 使用MediaPipe Hands
    try {
        const hands = new Hands({
            locateFile: (file) => {
                // 使用unpkg CDN，更可靠
                return `https://unpkg.com/@mediapipe/hands@0.4.1675469404/${file}`;
            }
        });
        
        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.3,
            minTrackingConfidence: 0.3
        });
        
        hands.onResults(onHandResults);
        
        const camera = new Camera(videoElement, {
            onFrame: async () => {
                try {
                    await hands.send({ image: videoElement });
                } catch (err) {
                    console.error('MediaPipe处理错误:', err);
                }
            },
            width: 640,
            height: 480
        });
        
        camera.start();
        detector = { hands, camera };
        console.log('MediaPipe已启动');
        updateHandStatus('模型已加载，等待检测手势...');
    } catch (err) {
        console.error('MediaPipe初始化错误:', err);
        updateHandStatus('模型加载失败: ' + err.message);
        console.error('详细错误:', err);
    }
}

// 处理手势识别结果
function onHandResults(results) {
    // 绘制调试信息
    if (debugCtx) {
        const video = document.getElementById('video');
        debugCtx.save();
        debugCtx.scale(-1, 1);
        debugCtx.translate(-debugCanvas.width, 0);
        debugCtx.drawImage(video, 0, 0, debugCanvas.width, debugCanvas.height);
        debugCtx.restore();
    }
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handLandmarks = results.multiHandLandmarks[0];
        gameState.handDetected = true;
        updateHandStatus('✅ 手势已检测');
        
        // 绘制手部关键点（调试用）
        if (debugCtx && handLandmarks) {
            debugCtx.save();
            debugCtx.scale(-1, 1);
            debugCtx.translate(-debugCanvas.width, 0);
            debugCtx.strokeStyle = '#00FF00';
            debugCtx.fillStyle = '#00FF00';
            debugCtx.lineWidth = 2;
            
            // 绘制关键点
            handLandmarks.forEach((landmark) => {
                const x = landmark.x * debugCanvas.width;
                const y = landmark.y * debugCanvas.height;
                debugCtx.beginPath();
                debugCtx.arc(x, y, 3, 0, 2 * Math.PI);
                debugCtx.fill();
            });
            
            debugCtx.restore();
        }
        
        // 检测是否是"枪"的手势
        if (isGunGesture(handLandmarks)) {
            gameState.isAiming = true;
            updateAimStatus('🎯 瞄准中...', 'aiming');
            handleAiming();
        } else {
            gameState.isAiming = false;
            updateAimStatus('请比出"枪"的手势（食指和拇指伸直）');
        }
    } else {
        handLandmarks = null;
        gameState.handDetected = false;
        gameState.isAiming = false;
        updateHandStatus('等待检测手势...');
        updateAimStatus('');
        
        // 清除调试画布
        if (debugCtx) {
            debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
        }
    }
}

// 检测是否是"枪"的手势（食指和拇指伸直，其他手指弯曲）
function isGunGesture(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;
    
    // 获取关键点
    const thumbTip = landmarks[4];
    const thumbIP = landmarks[3];
    const thumbMCP = landmarks[2];
    const indexTip = landmarks[8];
    const indexPIP = landmarks[6];
    const indexMCP = landmarks[5];
    const middleTip = landmarks[12];
    const middlePIP = landmarks[10];
    const middleMCP = landmarks[9];
    const ringTip = landmarks[16];
    const ringPIP = landmarks[14];
    const ringMCP = landmarks[13];
    const pinkyTip = landmarks[20];
    const pinkyPIP = landmarks[18];
    const pinkyMCP = landmarks[17];
    
    // 计算手指是否伸直
    const thumbExtended = thumbTip.y < thumbIP.y - 0.02;
    const indexExtended = indexTip.y < indexPIP.y - 0.02;
    const middleBent = middleTip.y > middlePIP.y + 0.01;
    const ringBent = ringTip.y > ringPIP.y + 0.01;
    const pinkyBent = pinkyTip.y > pinkyPIP.y + 0.01;
    
    // 枪的手势：拇指和食指伸直，其他手指弯曲
    const isGun = thumbExtended && indexExtended && 
                  (middleBent || middleTip.y > middleMCP.y) &&
                  (ringBent || ringTip.y > ringMCP.y) &&
                  (pinkyBent || pinkyTip.y > pinkyMCP.y);
    
    return isGun;
}

// 处理瞄准
function handleAiming() {
    if (!handLandmarks || !gameState.isPlaying || handLandmarks.length < 21) return;
    
    const indexTip = handLandmarks[8];
    if (!indexTip) return;
    
    // 检测射击动作（食指快速向上移动）
    if (lastIndexFingerY !== null) {
        const deltaY = lastIndexFingerY - indexTip.y;
        
        if (deltaY > shootingThreshold) {
            shoot();
            updateAimStatus('射击！', 'shooting');
            setTimeout(() => {
                if (gameState.isAiming) {
                    updateAimStatus('瞄准中...', 'aiming');
                }
            }, 200);
        }
    }
    
    lastIndexFingerY = indexTip.y;
}

// 射击
function shoot() {
    if (!gameState.isPlaying) return;
    
    gameState.shots++;
    updateScore();
    
    // 创建子弹
    const bullet = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    
    bullet.position.copy(camera.position);
    bullet.position.y -= 0.2;
    
    // 计算射击方向（从相机向前）
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);
    
    bullet.userData = {
        velocity: direction.multiplyScalar(0.5),
        lifetime: 0
    };
    
    scene.add(bullet);
    bullets.push(bullet);
}

// 检查是否击中靶子（使用射线检测）
function checkHit(bullet) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    // 获取所有靶子的子对象（用于精确碰撞检测）
    const targetObjects = [];
    targets.forEach(target => {
        if (!target.userData.isHit) {
            target.children.forEach(child => {
                if (child.geometry) {
                    targetObjects.push({
                        object: child,
                        target: target
                    });
                }
            });
        }
    });
    
    // 使用射线检测
    const intersects = raycaster.intersectObjects(
        targetObjects.map(item => item.object),
        true
    );
    
    if (intersects.length > 0) {
        const hitObject = intersects[0].object;
        const targetGroup = targetObjects.find(item => 
            item.object === hitObject || hitObject.parent === item.target
        );
        
        if (targetGroup && !targetGroup.target.userData.isHit) {
            const target = targetGroup.target;
            const hitPoint = intersects[0].point;
            const targetCenter = target.position;
            
            // 计算击中位置到靶子中心的距离
            const hitDistance = hitPoint.distanceTo(targetCenter);
            
            // 根据距离计算得分
            let points = 0;
            if (hitDistance < 0.2) {
                points = 50; // 中心
            } else if (hitDistance < 0.4) {
                points = 30; // 内圈
            } else if (hitDistance < 0.7) {
                points = 20; // 中圈
            } else if (hitDistance < 1.0) {
                points = 10; // 外圈
            }
            
            if (points > 0) {
                gameState.score += points;
                gameState.hits++;
                target.userData.isHit = true;
                target.userData.hitTime = Date.now();
                
                // 添加击中效果
                target.children.forEach(child => {
                    if (child.material) {
                        child.userData.originalMaterial = child.material;
                        child.material = new THREE.MeshStandardMaterial({
                            color: 0x00ff00,
                            emissive: 0x00ff00,
                            emissiveIntensity: 0.5
                        });
                    }
                });
                
                // 3秒后重置靶子
                setTimeout(() => {
                    target.userData.isHit = false;
                    target.children.forEach(child => {
                        if (child.userData.originalMaterial) {
                            child.material = child.userData.originalMaterial;
                        }
                    });
                }, 3000);
                
                updateScore();
                
                // 移除子弹
                const bulletIndex = bullets.indexOf(bullet);
                if (bulletIndex > -1) {
                    scene.remove(bullet);
                    bullets.splice(bulletIndex, 1);
                }
            }
        }
    }
}

// 更新分数显示
function updateScore() {
    document.getElementById('score').textContent = gameState.score;
    const accuracy = gameState.shots > 0 
        ? Math.round((gameState.hits / gameState.shots) * 100) 
        : 0;
    document.getElementById('accuracy').textContent = `准确率: ${accuracy}%`;
    document.getElementById('shots').textContent = `射击次数: ${gameState.shots}`;
}

// 更新手势状态显示
function updateHandStatus(text) {
    const statusEl = document.getElementById('hand-status');
    statusEl.textContent = text;
    statusEl.className = gameState.handDetected ? 'hand-detected' : '';
}

// 更新瞄准状态显示
function updateAimStatus(text, className = '') {
    const statusEl = document.getElementById('aim-status');
    statusEl.textContent = text;
    statusEl.className = className;
}

// 设置事件监听
function setupEventListeners() {
    // 空格键开始/暂停
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            toggleGame();
        }
    });
    
    // 窗口大小调整
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// 切换游戏状态
function toggleGame() {
    gameState.isPlaying = !gameState.isPlaying;
    
    if (gameState.isPlaying) {
        if (gameState.handDetected) {
            updateHandStatus('游戏进行中...');
        } else {
            updateHandStatus('游戏进行中...（等待检测手势）');
        }
        // 重置所有靶子
        targets.forEach(target => {
            target.userData.isHit = false;
        });
    } else {
        updateHandStatus('游戏已暂停');
        updateAimStatus('按空格键继续');
    }
}

// 动画循环
function animate() {
    requestAnimationFrame(animate);
    
    // 更新子弹并检查碰撞
    bullets.forEach((bullet, index) => {
        bullet.position.add(bullet.userData.velocity);
        bullet.userData.lifetime++;
        
        // 检查是否击中靶子
        checkHit(bullet);
        
        // 移除超出范围的子弹
        if (bullet.userData.lifetime > 100 || bullet.position.z < -20) {
            scene.remove(bullet);
            bullets.splice(index, 1);
        }
    });
    
    // 旋转靶子（如果未被击中）
    targets.forEach(target => {
        if (!target.userData.isHit) {
            target.rotation.z += 0.01;
        }
    });
    
    renderer.render(scene, camera);
}

// 启动游戏
init();
