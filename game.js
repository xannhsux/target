// ES6 Module Imports
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Make THREE available globally for debugging
window.THREE = THREE;

// Game State
let gameState = {
    score: 0,
    shots: 0, // Hit attempts
    hits: 0,
    isPlaying: false,
    handDetected: false,
    isAiming: false,
    isPunching: false
};

// Three.js Scene Setup
let scene, camera, renderer;
let punchingBag; // Replacing targets array
let targets = []; // Compatibility array for old code
let bullets = []; // Keep for compat, no longer used
let aimingLine;
let crosshair; // Crosshair group attached to camera
let audioCtx;

// Hand Detection
let detector;
let debugCanvas;
let debugCtx;
let animationFrameId;

// Gesture State
let handStates = {
    'Left': { lastSize: null, lastPunchTime: 0 },
    'Right': { lastSize: null, lastPunchTime: 0 }
}; // Stable tracking using Left/Right labels to avoid index swapping
let punchSizeThreshold = 0.04;
let lastPunchTime = 0;

// Initialization
async function init() {
    setupThreeJS();
    setupDebugCanvas();
    await setupHandDetection();
    setupEventListeners();
    createTargets();
    animate();
}

// Setup Three.js Scene
function setupThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Pure black background

    // Camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 1.6, 5);

    // Renderer
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('game-canvas'),
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // Lights - Enhanced for better rabbit visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Increased ambient light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Increased intensity
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Add a second light from the front for better visibility
    const frontLight = new THREE.DirectionalLight(0xffffff, 0.6);
    frontLight.position.set(0, 5, 10);
    scene.add(frontLight);

    // Create Floor
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000, // Black floor to match background
        roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create Aiming Guide Line (Dashed) - Yellow is more visible
    const lineMaterial = new THREE.LineDashedMaterial({
        color: 0xffff00,
        linewidth: 3,
        scale: 1,
        dashSize: 0.8,
        gapSize: 0.4
    });

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -50)
    ]);

    aimingLine = new THREE.Line(lineGeometry, lineMaterial);
    aimingLine.computeLineDistances();
    aimingLine.visible = false; // Hidden by default
    scene.add(aimingLine);

    // Create Crosshair
    createCrosshair();
}

// Create Crosshair
function createCrosshair() {
    const crosshairGroup = new THREE.Group();

    // Horizontal line
    const hGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.1, 0, -0.5),
        new THREE.Vector3(0.1, 0, -0.5)
    ]);
    const hLine = new THREE.Line(hGeometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    crosshairGroup.add(hLine);

    // Vertical line
    const vGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.1, -0.5),
        new THREE.Vector3(0, 0.1, -0.5)
    ]);
    const vLine = new THREE.Line(vGeometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    crosshairGroup.add(vLine);

    // Center point
    const dotGeometry = new THREE.CircleGeometry(0.01, 8);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.z = -0.5;
    crosshairGroup.add(dot);

    camera.add(crosshairGroup);
    crosshair = crosshairGroup;
}

// Create Punching Target (Rabbit GLB Model)
function createTargets() {
    const loader = new GLTFLoader();

    loader.load(
        'rabbit.glb',
        function (gltf) {
            // Successfully loaded the rabbit model
            const rabbitModel = gltf.scene;

            // Scale and position the rabbit
            rabbitModel.scale.set(2, 2, 2); // Adjust size as needed
            rabbitModel.position.set(0, 2, -5); // Position in front of camera

            // Enable shadows
            rabbitModel.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            scene.add(rabbitModel);
            punchingBag = rabbitModel;

            // Compatibility with old detection code
            targets = [rabbitModel];

            console.log('✅ Rabbit model loaded successfully!');
        },
        function (xhr) {
            // Loading progress
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function (error) {
            // Error loading model
            console.error('❌ Error loading rabbit.glb:', error);

            // Fallback: create a simple cube as placeholder
            const fallbackGeometry = new THREE.BoxGeometry(1, 1, 1);
            const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0xff00ff });
            const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
            fallbackMesh.position.set(0, 2, -5);
            scene.add(fallbackMesh);
            punchingBag = fallbackMesh;
            targets = [fallbackMesh];
        }
    );
}

// Initialize Audio
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Play hit sound
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

    // Secondary high-freq sound for impact
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

// Setup Debug Canvas
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

// Setup Hand Detection - Using TensorFlow.js HandPose
async function setupHandDetection() {
    const videoElement = document.getElementById('video');

    // Get camera stream
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        });
        videoElement.srcObject = stream;

        // Wait for video to load
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                resolve();
            };
        });

        updateHandStatus('Camera started, loading model...');
    } catch (err) {
        console.error('Failed to access camera:', err);
        updateHandStatus('Camera access failed, please check permissions');
        return;
    }

    // Wait for TF.js libraries
    let retries = 0;
    const maxRetries = 100;

    while (typeof handPoseDetection === 'undefined' && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }

    if (typeof handPoseDetection === 'undefined') {
        console.error('TF.js HandPose library not loaded');
        updateHandStatus('HandPose library failed to load, check network');
        return;
    }

    // Use TF.js HandPose (MediaPipe Runtime)
    try {
        updateHandStatus('Initializing model (MediaPipe)...');

        const model = handPoseDetection.SupportedModels.MediaPipeHands;
        const detectorConfig = {
            runtime: 'mediapipe',
            maxHands: 2,
            modelType: 'full',
            solutionPath: `https://cdn.jsdelivr.net/npm/@mediapipe/hands`
        };

        detector = await handPoseDetection.createDetector(model, detectorConfig);
        console.log('HandPose Model (MediaPipe) loaded');
        updateHandStatus('✅ Model loaded, waiting for gestures...');

        // Start detection loop
        detectHands();
    } catch (err) {
        console.error('HandPose (MediaPipe) init error:', err);
        updateHandStatus('Model failed to load: ' + err.message);
    }
}

// Continuous Hand Detection
async function detectHands() {
    const videoElement = document.getElementById('video');

    async function detect() {
        if (detector && videoElement.readyState >= 2) {
            try {
                const hands = await detector.estimateHands(videoElement);
                processHandResults(hands);
            } catch (err) {
                console.error('Hand detection error:', err);
            }
        }

        requestAnimationFrame(detect);
    }

    detect();
}

// Process detection results - map TF format to MediaPipe-like format
function processHandResults(hands) {
    const video = document.getElementById('video');

    // Draw video to debug canvas
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

        // Process each hand
        hands.forEach((hand) => {
            const handScore = hand.score || 0;
            if (handScore < 0.6) return;

            // Get handedness (Left/Right)
            const label = hand.handedness && hand.handedness[0] ? hand.handedness[0].label : 'Right';

            // Convert coordinates
            const landmarks = hand.keypoints.map(kp => ({
                x: kp.x / video.videoWidth,
                y: kp.y / video.videoHeight,
                z: kp.z || 0
            }));

            // Draw landmarks for debugging
            if (debugCtx) {
                debugCtx.save();
                debugCtx.scale(-1, 1);
                debugCtx.translate(-debugCanvas.width, 0);
                // Use distinct colors for Left/Right hands
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

            // Punching logic
            if (gameState.isPlaying) {
                // If Right hand (or only one hand), control camera rotation
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

        // Update status text
        if (fistsReady > 0) {
            updateHandStatus(`✊ ${fistsReady} Fist(s) Ready! PUNCH!`);
        } else {
            updateHandStatus('✋ Clench your fist...');
        }
    } else {
        gameState.handDetected = false;
        gameState.isAiming = false;
        updateHandStatus('Waiting for gesture...');
        if (debugCtx) debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
    }
}

// Check if a hand is clenched in a fist
function checkIsFist(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    // Calculate distance from fingertips to wrist
    const distance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    const wrist = landmarks[0];
    const fingerTips = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky tips
    const knuckles = [5, 9, 13, 17]; // MCP nodes

    let collapsedCount = 0;
    for (let i = 0; i < fingerTips.length; i++) {
        const tipDist = distance(wrist, landmarks[fingerTips[i]]);
        const knuckleDist = distance(wrist, landmarks[knuckles[i]]);

        // If tip is closer to wrist than knuckle, the finger is curled
        if (tipDist < knuckleDist * 1.3) collapsedCount++;
    }

    return collapsedCount >= 3;
}

// Detect Punch Gesture (based on size surge)
function detectPunchAction(landmarks, handLabel = 'Right') {
    const wrist = landmarks[0];
    const indexMCP = landmarks[5];
    const currentSize = Math.sqrt(Math.pow(indexMCP.x - wrist.x, 2) + Math.pow(indexMCP.y - wrist.y, 2));

    const state = handStates[handLabel];
    if (state && state.lastSize !== null) {
        const deltaSize = currentSize - state.lastSize;
        const now = Date.now();

        // Use 0.04 threshold to require deliberate forward movement
        if (deltaSize > 0.04 && now - state.lastPunchTime > 500) {
            handlePunch();
            state.lastPunchTime = now;
        }
    }
    if (state) state.lastSize = currentSize;
}

// Handle Punch (Guaranteed Hit logic)
function handlePunch() {
    gameState.shots++;
    updateScore();
    updateAimStatus('🥊 ATTACK!', 'shooting');

    // Trigger hit effect immediately upon punch detection
    onBagHit();

    setTimeout(() => {
        if (gameState.isPlaying) updateAimStatus('');
    }, 300);
}

// Handle Bag Hit
function onBagHit() {
    gameState.score += 50;
    gameState.hits++;
    updateScore();
    playPunchSound();

    // Bag animation: Tilt back
    if (punchingBag) {
        punchingBag.rotation.x = -Math.PI / 8;
        punchingBag.userData.velocity = 0.2;

        // Visual feedback: Flash red on all meshes
        punchingBag.traverse((node) => {
            if (node.isMesh && node.material) {
                // Store original emissive if not already stored
                if (!node.userData.originalEmissive) {
                    node.userData.originalEmissive = node.material.emissive ? node.material.emissive.clone() : new THREE.Color(0x000000);
                }

                if (node.material.emissive) {
                    node.material.emissive.setHex(0xff0000);
                    node.material.emissiveIntensity = 0.8;
                }
            }
        });

        // Reset after flash
        setTimeout(() => {
            punchingBag.traverse((node) => {
                if (node.isMesh && node.material && node.material.emissive) {
                    node.material.emissiveIntensity = 0;
                }
            });
        }, 200);
    }
}

// (Legacy/Deprecated functions)
function handleAiming() { }
function shoot() { }

// Update Score Display
function updateScore() {
    const scoreValEl = document.getElementById('score');
    if (scoreValEl) scoreValEl.textContent = gameState.score;

    const accuracyEl = document.getElementById('accuracy');
    const accuracy = gameState.shots > 0
        ? Math.round((gameState.hits / gameState.shots) * 100)
        : 0;
    if (accuracyEl) accuracyEl.textContent = `Accuracy: ${accuracy}%`;

    const shotsEl = document.getElementById('shots');
    if (shotsEl) shotsEl.textContent = `Punches: ${gameState.shots}`;
}

// Update Hand Gesture Status
function updateHandStatus(text) {
    const statusEl = document.getElementById('hand-status');
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.className = gameState.handDetected ? 'hand-detected' : '';
    }
}

// Update Aim/Attack Message
function updateAimStatus(text, className = '') {
    const statusEl = document.getElementById('aim-status');
    statusEl.textContent = text;
    statusEl.className = className;
}

// Setup Event Listeners
function setupEventListeners() {
    // Space to start/pause or manual punch
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            initAudio(); // Start audio context on user interaction

            if (gameState.isPlaying) {
                // Manual punch simulation for testing
                handlePunch();
            } else {
                toggleGame();
            }
        }
    });

    // Window Resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// Toggle Game Play State
function toggleGame() {
    gameState.isPlaying = !gameState.isPlaying;

    if (gameState.isPlaying) {
        if (gameState.handDetected) {
            updateHandStatus('Game Active...');
        } else {
            updateHandStatus('Game Active... (Waiting for hands)');
        }
        // Reset targets compatibility
        targets.forEach(target => {
            target.userData.isHit = false;
        });
    } else {
        updateHandStatus('Game Paused');
        updateAimStatus('Press SPACE to Resume');
    }
}

// Animation Loop
function animate() {
    requestAnimationFrame(animate);

    // Bag physical simulation: Simple sway recovery
    if (punchingBag) {
        punchingBag.rotation.x *= 0.95;
        punchingBag.rotation.z *= 0.95;
    }

    renderer.render(scene, camera);
}

// Initialize the game
init();
