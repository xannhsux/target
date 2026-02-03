// 游戏状态
let gameState = {
    score: 0,
    shots: 0, // 记录打击尝试
    hits: 0,
    isPlaying: false,
    handDetected: false,
    isAiming: false,
    isPunching: false
};

// Three.js 场景设置
let scene, camera, renderer;
let punchingBag; // 替换 targets 数组
let bullets = []; // 保留以便旧代码不报错，但不再使用
let aimingLine;
let audioCtx;

// Hand Detection
let detector;
let debugCanvas;
let debugCtx;
let animationFrameId;

// 手势状态
let handStates = {
    'Left': { lastSize: null, lastPunchTime: 0 },
    'Right': { lastSize: null, lastPunchTime: 0 }
}; // 使用左右手标签独立跟踪，避免索引交换导致的跳变
let punchSizeThreshold = 0.04;
let lastPunchTime = 0;

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

    // 创建瞄准辅助线（虚线）- 黄色更显眼
    const lineMaterial = new THREE.LineDashedMaterial({
        color: 0xffff00,  // 改为黄色
        linewidth: 3,
        scale: 1,
        dashSize: 0.8,    // 增大虚线段
        gapSize: 0.4
    });

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -50)
    ]);

    aimingLine = new THREE.Line(lineGeometry, lineMaterial);
    aimingLine.computeLineDistances();
    aimingLine.visible = false; // 默认隐藏
    scene.add(aimingLine);

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

// 创建沙包
function createTargets() {
    const bagGroup = new THREE.Group();

    // 沙包主体
    const bagGeometry = new THREE.CylinderGeometry(0.8, 0.8, 3, 32);
    const bagMaterial = new THREE.MeshStandardMaterial({
        color: 0x8b0000,
        roughness: 0.5,
        metalness: 0.2
    });
    const bagMesh = new THREE.Mesh(bagGeometry, bagMaterial);
    bagMesh.position.y = -1.5; // 挂点在顶部
    bagGroup.add(bagMesh);

    // 挂绳
    const ropeGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2, 8);
    const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const rope = new THREE.Mesh(ropeGeometry, ropeMaterial);
    rope.position.y = 1;
    bagGroup.add(rope);

    bagGroup.position.set(0, 4, -5); // 悬挂在前方
    scene.add(bagGroup);
    punchingBag = bagGroup;

    // 为了兼容旧的检测代码，我们将 bagMesh 放入 targets
    targets = [bagMesh];
}

// 初始化音效
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// 播放打击声 "乓"
function playPunchSound() {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);

    // 第二个高频音模拟碰撞
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(800, audioCtx.currentTime);
    gain2.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain2.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.05);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start();
    osc2.stop(audioCtx.currentTime + 0.05);
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

// 设置手势检测 - 使用TensorFlow.js HandPose
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

    // 等待TensorFlow.js库加载完成
    let retries = 0;
    const maxRetries = 100;

    while (typeof handPoseDetection === 'undefined' && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }

    if (typeof handPoseDetection === 'undefined') {
        console.error('TensorFlow.js HandPose库未加载');
        updateHandStatus('HandPose库加载失败，请检查网络连接');
        return;
    }

    // 使用TensorFlow.js HandPose (MediaPipe Runtime)
    try {
        updateHandStatus('正在初始化模型(MediaPipe)...');

        const model = handPoseDetection.SupportedModels.MediaPipeHands;
        const detectorConfig = {
            runtime: 'mediapipe', // 切换到 mediapipe 运行时
            maxHands: 2, // 启用双拳
            modelType: 'full',
            solutionPath: `https://cdn.jsdelivr.net/npm/@mediapipe/hands` // 指定解决方案路径
        };

        detector = await handPoseDetection.createDetector(model, detectorConfig);
        console.log('HandPose模型(MediaPipe)已加载');
        updateHandStatus('✅ 模型已加载，等待检测近处手势...');

        // 开始检测循环
        detectHands();
    } catch (err) {
        console.error('HandPose(MediaPipe)初始化错误:', err);
        updateHandStatus('模型加载失败: ' + err.message);
    }
}

// 持续检测手势
async function detectHands() {
    const videoElement = document.getElementById('video');

    async function detect() {
        if (detector && videoElement.readyState >= 2) {
            try {
                const hands = await detector.estimateHands(videoElement);
                processHandResults(hands);
            } catch (err) {
                console.error('手势检测错误:', err);
            }
        }

        requestAnimationFrame(detect);
    }

    detect();
}

// 处理手势检测结果 - 将TensorFlow格式转换为类似MediaPipe的格式
function processHandResults(hands) {
    const video = document.getElementById('video');

    // 绘制调试信息
    if (debugCtx) {
        debugCtx.save();
        debugCtx.scale(-1, 1);
        debugCtx.translate(-debugCanvas.width, 0);
        debugCtx.drawImage(video, 0, 0, debugCanvas.width, debugCanvas.height);
        debugCtx.restore();
    }

    if (hands && hands.length > 0) {
        gameState.handDetected = true;
        let totalHands = hands.length;
        let fistsReady = 0;

        // 处理每一只手
        hands.forEach((hand) => {
            const handScore = hand.score || 0;
            if (handScore < 0.6) return;

            // 获取手性 (Left/Right)
            const label = hand.handedness && hand.handedness[0] ? hand.handedness[0].label : 'Right';

            // 转换坐标
            const landmarks = hand.keypoints.map(kp => ({
                x: kp.x / video.videoWidth,
                y: kp.y / video.videoHeight,
                z: kp.z || 0
            }));

            // 绘制调试信息
            if (debugCtx) {
                debugCtx.save();
                debugCtx.scale(-1, 1);
                debugCtx.translate(-debugCanvas.width, 0);
                // 使用更鲜艳的红色和蓝色区分左右手
                debugCtx.strokeStyle = label === 'Left' ? '#FF3B30' : '#007AFF';
                debugCtx.fillStyle = label === 'Left' ? '#FF3B30' : '#007AFF';
                debugCtx.lineWidth = 2;
                landmarks.forEach((landmark) => {
                    const x = landmark.x * debugCanvas.width;
                    const y = landmark.y * debugCanvas.height;
                    debugCtx.beginPath();
                    debugCtx.arc(x, y, 3, 0, 2 * Math.PI);
                    debugCtx.fill();
                });
                debugCtx.restore();
            }

            // 拳击逻辑
            if (gameState.isPlaying) {
                // 如果是右手（或第一只手），控制相机视野
                if (label === 'Right' || totalHands === 1) {
                    const wrist = landmarks[0];
                    const targetRotationY = (0.5 - wrist.x) * Math.PI / 3;
                    const targetRotationX = (wrist.y - 0.5) * Math.PI / 4;
                    if (!isNaN(targetRotationY) && !isNaN(targetRotationX)) {
                        camera.rotation.y += (targetRotationY - camera.rotation.y) * 0.1;
                        camera.rotation.x += (targetRotationX - camera.rotation.x) * 0.1;
                    }
                }

                if (checkIsFist(landmarks)) fistsReady++;
                detectPunchAction(landmarks, label);
            }
        });

        // 更新状态文字
        if (fistsReady > 0) {
            updateHandStatus(`✊ ${fistsReady}只拳头已就绪！出拳！`);
        } else {
            updateHandStatus('✋ 请握紧拳头...');
        }
    } else {
        gameState.handDetected = false;
        gameState.isAiming = false;
        updateHandStatus('等待检测手势...');
        if (debugCtx) debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
    }
}

// 检查是否是拳头
function checkIsFist(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    // 计算关键点到手腕的距离，如果指尖跟手腕很近，说明握拳了
    const distance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    const wrist = landmarks[0];
    const fingerTips = [8, 12, 16, 20]; // 食指、中指、无名指、小指尖
    const knuckles = [5, 9, 13, 17]; // 指根 MCP 节点

    let collapsedCount = 0;
    for (let i = 0; i < fingerTips.length; i++) {
        const tipDist = distance(wrist, landmarks[fingerTips[i]]);
        const knuckleDist = distance(wrist, landmarks[knuckles[i]]);

        // 如果指尖距离手腕比指根距离手腕更近，或者非常接近，说明手指弯曲了
        if (tipDist < knuckleDist * 1.3) collapsedCount++;
    }

    return collapsedCount >= 3;
}

// 检测挥拳动作 (核心优化：使用手部尺寸变化代替 Z 轴)
function detectPunchAction(landmarks, handLabel = 'Right') {
    const wrist = landmarks[0];
    const indexMCP = landmarks[5];
    const currentSize = Math.sqrt(Math.pow(indexMCP.x - wrist.x, 2) + Math.pow(indexMCP.y - wrist.y, 2));

    const state = handStates[handLabel];
    if (state && state.lastSize !== null) {
        const deltaSize = currentSize - state.lastSize;
        const now = Date.now();

        // 阈值提高到 0.04，确保需要明显的“冲拳”动作才触发
        if (deltaSize > 0.04 && now - state.lastPunchTime > 500) {
            handlePunch();
            state.lastPunchTime = now;
        }
    }
    if (state) state.lastSize = currentSize;
}

// 处理挥拳 (必中逻辑)
function handlePunch() {
    gameState.shots++;
    updateScore();
    updateAimStatus('🥊 挥拳攻击！', 'shooting');

    // 必中逻辑：只要检测到挥拳，就直接触发击中效果
    onBagHit();

    setTimeout(() => {
        if (gameState.isPlaying) updateAimStatus('');
    }, 300);
}

// 沙包被击中
function onBagHit() {
    gameState.score += 50;
    gameState.hits++;
    updateScore();
    playPunchSound();

    // 沙包动画：扭动
    punchingBag.rotation.x = -Math.PI / 8; // 向后倒
    punchingBag.userData.velocity = 0.2;

    // 反馈颜色
    const bagMesh = punchingBag.children[0];
    bagMesh.material.emissive.setHex(0xff0000);
    bagMesh.material.emissiveIntensity = 0.8;

    setTimeout(() => {
        bagMesh.material.emissiveIntensity = 0;
    }, 200);
}

// (已弃用)
function handleAiming() { }
function shoot() { }

// 检查是否击中靶子（修复版：球体碰撞，支持简化球体和复杂模型）
function checkHit(bullet) {
    // 修复4: 使用球体碰撞检测，更适合简化版红球目标
    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];

        // 跳过已经击中的目标
        if (target.userData.isHit) continue;

        // 计算子弹和目标之间的距离
        const distance = bullet.position.distanceTo(target.position);

        // 如果距离小于目标半径（1.5），则击中
        if (distance < 1.5) {
            // 击中！计算得分（根据距离）
            let points = 0;
            if (distance < 0.5) {
                points = 100; // 正中心
            } else if (distance < 0.8) {
                points = 75;
            } else if (distance < 1.2) {
                points = 50;
            } else {
                points = 25;
            }

            gameState.score += points;
            gameState.hits++;
            target.userData.isHit = true;

            // 变绿色表示击中（支持简化版和复杂版）
            if (target.material) {
                // 简化版：直接修改target.material
                target.material.emissive = new THREE.Color(0x00ff00);
                target.material.emissiveIntensity = 0.8;
            }

            if (target.children && target.children.length > 0) {
                // 复杂版：修改children的material
                target.children.forEach(child => {
                    if (child.material) {
                        child.material.emissive = new THREE.Color(0x00ff00);
                        child.material.emissiveIntensity = 0.8;
                    }
                });
            }

            // 1秒后变回红色并重置
            setTimeout(() => {
                if (target.material) {
                    target.material.emissive = new THREE.Color(0xff0000);
                    target.material.emissiveIntensity = 0.3;
                }
                if (target.children && target.children.length > 0) {
                    target.children.forEach(child => {
                        if (child.material) {
                            child.material.emissive = new THREE.Color(0xff0000);
                            child.material.emissiveIntensity = 0.3;
                        }
                    });
                }
                target.userData.isHit = false;
            }, 1000);

            updateScore();

            // 移除子弹
            const bulletIndex = bullets.indexOf(bullet);
            if (bulletIndex > -1) {
                scene.remove(bullet);
                bullets.splice(bulletIndex, 1);
            }

            // 已找到击中，退出循环
            return;
        }
    }
}

// 更新分数显示
function updateScore() {
    const scoreValEl = document.getElementById('score');
    if (scoreValEl) scoreValEl.textContent = gameState.score;

    const accuracyEl = document.getElementById('accuracy');
    const accuracy = gameState.shots > 0
        ? Math.round((gameState.hits / gameState.shots) * 100)
        : 0;
    if (accuracyEl) accuracyEl.textContent = `击中率: ${accuracy}%`;

    const shotsEl = document.getElementById('shots');
    if (shotsEl) shotsEl.textContent = `出拳次数: ${gameState.shots}`;
}

// 更新手势状态显示
function updateHandStatus(text) {
    const statusEl = document.getElementById('hand-status');
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.className = gameState.handDetected ? 'hand-detected' : '';
    }
}

// 更新瞄准状态显示
function updateAimStatus(text, className = '') {
    const statusEl = document.getElementById('aim-status');
    statusEl.textContent = text;
    statusEl.className = className;
}

// 设置事件监听
function setupEventListeners() {
    // 空格键射击（如果游戏进行中）或开始游戏
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            initAudio(); // 用户交互后启动音频上下文

            // 如果游戏正在进行则手动模拟出拳（用于测试）
            if (gameState.isPlaying) {
                handlePunch();
            } else {
                toggleGame();
            }
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

    // 沙包物理模拟：简单的摆动恢复
    if (punchingBag) {
        // 恢复原状的力
        punchingBag.rotation.x *= 0.95;
        punchingBag.rotation.z *= 0.95;
    }

    renderer.render(scene, camera);
}

// 启动游戏
init();
