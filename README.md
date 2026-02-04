# 3D Gesture Punching Game 🥊🐰

An immersive, gesture-controlled 3D boxing game built with **Three.js** and **MediaPipe Hands**. Punch a virtual rabbit using your bare hands against a dramatic black background!

## 🌟 Key Features

- 🎮 **Dual-Hand Detection**: Tracks both left and right hands independently using high-performance AI.
- 🥊 **Intuitive Gestures**: 
  - **Clench Fist**: Close your fingers to "prepare" your punch.
  - **Strike**: Move your hand forward quickly to hit the bag.
- � **Guaranteed Hit System**: Simplified collision logic ensures every valid punch gesture registers as a satisfying hit.
- 🎨 **Rich Visual Feedback**:
  - Dramatic black background with enhanced lighting on the 3D rabbit model.
  - Dynamic rabbit tilt animation and red flash on impact.
  - Color-coded hand tracking (Red for Left, Blue for Right).
- 📊 **Real-time Stats**: Track your Score, Accuracy, and total Punch count.
- 🔊 **Audio Experience**: Positional-style "Bang Bang" sound effects for every hit.

## 🚀 How to Play

1. **Launch the Game**
   - Open `index.html` in a modern browser (Chrome/Edge recommended).
   - Use a local server (e.g., `python -m http.server`) for the best experience.

2. **Grant Camera Permissions**
   - Click "Allow" when prompted for camera access.
   - Position yourself 0.5 - 1.5 meters from the webcam.

3. **Start Action**
   - Press **SPACE** to Start or Pause the game.
   - Show your fists to the camera.
   - Strike forward!

4. **Custom Photo Target (Optional)**
   - Click the "Choose Photo" button in the bottom-right corner.
   - Upload any photo you want to punch.
   - The photo will become your new 3D target!
   - Click "Use Default Rabbit" to switch back.

## 🛠️ Technical Stack

- **Three.js**: Modern 3D rendering and physics visualization.
- **MediaPipe Hands**: Google's high-fidelity hand and finger tracking.
- **TensorFlow.js**: Running AI models directly in the browser.
- **Vanilla JavaScript**: Core game logic and UI management.

## 📋 Requirements

- **Browser**: Latest version of Chrome, Edge, or Firefox.
- **Hardware**: A standard webcam and a well-lit environment.

## 💻 Development Setup

To run locally with a development server:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx http-server
```

Then visit `http://localhost:8000` in your browser.

---

Enjoy the workout and release some stress! 🥊🔥
