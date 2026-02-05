# 📱 Mobile Device Testing Guide

## Quick Access Methods

### Method 1: Same Network Access (Recommended)
1. **Find your computer's IP address:**
   - Mac: System Preferences → Network → Your IP address will be shown
   - Or run in terminal: `ipconfig getifaddr en0` (WiFi) or `ipconfig getifaddr en1` (Ethernet)

2. **Make sure your mobile device is on the same WiFi network**

3. **Open the game on your phone:**
   - Open browser (Chrome/Safari) on your phone
   - Enter: `http://YOUR.IP.ADDRESS:8000`
   - Example: `http://192.168.1.100:8000`

### Method 2: Using ngrok (For Remote Access)
1. **Install ngrok:**
   ```bash
   # Using Homebrew (Mac)
   brew install ngrok
   
   # Or download from: https://ngrok.com/download
   ```

2. **Start ngrok tunnel:**
   ```bash
   ngrok http 8000
   ```

3. **Use the provided URL:**
   - ngrok will show a URL like: `https://xxxx-xx-xx-xx-xx.ngrok-free.app`
   - Open this URL on any device, anywhere!

## 🎮 Mobile Usage Tips

### Portrait Mode (Vertical Phone)
- ✅ Best for casual single-hand play
- ✅ All UI elements are compact and accessible
- ✅ Camera feed is smaller to save space
- ✅ Perfect for quick gaming sessions

### Landscape Mode (Horizontal Phone)
- ✅ Wider view of the 3D scene
- ✅ Better for two-handed gestures
- ✅ More immersive experience

### Tablet
- ✅ Best of both worlds - large screen with portability
- ✅ UI spreads comfortably
- ✅ Great for family/friends playing together

## 📸 Camera Permissions

**Important:** Mobile browsers require HTTPS for camera access (except localhost).

- **Testing locally:** Works on `localhost:8000` without HTTPS
- **Testing remotely:** Use ngrok (automatically provides HTTPS)
- **iOS Safari:** May prompt multiple times - always click "Allow"
- **Android Chrome:** Shows one-time permission request

## 🔧 Troubleshooting

### Camera not working on mobile?
1. Check browser permissions: Settings → Safari/Chrome → Camera
2. Make sure you're using HTTPS (or localhost)
3. Try reloading the page
4. Close other apps that might be using the camera

### Layout looks wrong?
1. Try rotating your device (triggers resize)
2. Hard refresh: Settings → Clear cache, or use Private/Incognito mode
3. Make sure you're using the latest browser version

### Game is slow on mobile?
- MediaPipe hand detection is CPU-intensive
- Works best on newer phones (2019+)
- Close other apps to free up resources
- Lower screen brightness may help with battery

## 🌐 Sharing with Friends

Want your friends to try it?

**Option 1: Local Network Party**
- Everyone connects to same WiFi
- Share your IP: `http://YOUR.IP:8000`
- Multiple people can play at once!

**Option 2: Internet Access**
- Use ngrok to create public URL
- Share the ngrok URL with anyone
- Works anywhere in the world!

---

Happy Punching! 🥊🎮
