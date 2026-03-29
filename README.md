# Video Player

A modern, feature-rich video player built with vanilla JavaScript, HTML, and CSS. Designed for optimal performance and user experience with a sleek, dark theme interface.

## Features

### Core Playback
- **Universal Format Support**: Plays MP4, WebM, MKV, AVI, MOV, FLV, WMV, and M4V files
- **Hardware Acceleration**: GPU-accelerated video decoding for smooth playback
- **Codec Detection**: Automatic detection and display of video/audio codecs (H.264, H.265, VP9, AV1, AAC, Opus, etc.)
- **Quality Metadata**: Real-time display of resolution, bitrate, and codec information

### User Interface
- **Modern Dark Theme**: Sleek, eye-friendly dark interface with gradient accents
- **Drag & Drop**: Simply drag video files onto the player to load them
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Intuitive Controls**: Single-row control layout with all essential functions
- **Quality Badge**: Live display of current video quality and codec in control bar

### Advanced Buffering
- **Intelligent Buffer Management**: Monitors buffer health in real-time
- **Configurable Buffer Ahead/Behind**: Customizable buffer targets (1-30s ahead, 1-20s behind)
- **Auto Quality Adjustment**: Automatic quality degradation when buffering issues detected
- **Max Bitrate Limiting**: Optional bandwidth constraints for network-limited scenarios

### Performance Monitoring
- **Stats Overlay**: Real-time playback statistics (press 'S' to toggle)
- **Buffer Health Indicator**: Visual feedback on buffering status
- **Network Speed Estimation**: Monitors connection speed for quality decisions
- **Codec Support Detection**: Shows browser compatibility for various codecs

### Playback Controls
- **Speed Control**: 0.25x to 2x playback speed with custom speed input
- **Volume Control**: Smooth volume slider with mute toggle
- **Seek Controls**: Click-to-seek progress bar with time tooltip
- **Keyboard Shortcuts**: Full keyboard navigation support

### Keyboard Shortcuts
- **Space / K**: Play/Pause
- **M**: Mute/Unmute
- **F**: Toggle fullscreen
- **← / J**: Seek backward (configurable: 5s, 10s, 15s, 30s)
- **→ / L**: Seek forward (configurable: 5s, 10s, 15s, 30s)
- **↑**: Volume up
- **↓**: Volume down
- **< / >**: Decrease/Increase playback speed
- **0-9**: Seek to 0%-90% of video
- **S**: Toggle stats overlay
- **?**: Show keyboard shortcuts overlay
- **Escape**: Close overlays and menus

## Getting Started

### Quick Start
1. Open `index.html` in a modern web browser
2. Drag and drop a video file onto the player, or click to select a file
3. The video will load and begin playing automatically

### Supported Formats
- **Video**: MP4 (H.264, H.265), WebM (VP8, VP9, AV1), MKV, AVI, MOV, FLV, WMV, M4V
- **Audio**: AAC, Opus, Vorbis, MP3, FLAC, PCM

### Browser Requirements
- Chrome 60+ (recommended)
- Firefox 55+
- Safari 11+
- Edge 79+

## Settings

### Performance Settings
- **Hardware Acceleration**: Toggle GPU-accelerated decoding (default: On)

### Playback Settings
- **Arrow Key Skip Duration**: Configure seek distance (5s, 10s, 15s, 30s)

### Buffering Settings
- **Buffer Ahead**: Target buffer ahead time (1-30 seconds, default: 10s)
- **Buffer Behind**: Target buffer behind time (1-20 seconds, default: 5s)
- **Auto Quality Adjustment**: Enable automatic quality reduction on buffering issues
- **Max Bitrate**: Limit maximum bitrate (Auto, 1 Mbps, 2 Mbps, 5 Mbps, Unlimited)

## Technical Details

### Architecture
The player is built with a modular architecture:

- **Player Module** (`js/player.js`): Core video playback, state management, and buffering logic
- **Controls Module** (`js/controls.js`): UI interactions, progress bar, and control updates
- **Keyboard Module** (`js/keyboard.js`): Keyboard shortcuts and visual feedback
- **Utils Module** (`js/utils.js`): Utility functions including codec detection and formatting

### Performance Optimizations
- **Hardware Acceleration**: GPU-accelerated video rendering with CSS containment
- **Throttled Updates**: Time updates throttled to 100ms for smooth performance
- **Efficient Buffering**: Smart buffer monitoring with health indicators
- **Memory Management**: Proper blob URL cleanup to prevent memory leaks

### Codec Detection
The player automatically detects supported codecs using the MediaSource API:
- Checks browser support for H.264, H.265, VP9, AV1 video codecs
- Checks browser support for AAC, Opus, Vorbis, MP3, FLAC audio codecs
- Displays detected codec information in the quality badge and stats overlay

### Buffering Intelligence
Advanced buffering system that:
- Monitors buffer ahead and behind in real-time
- Tracks buffer health (good, warning, critical)
- Estimates network speed from buffered data
- Provides automatic quality adjustment recommendations

## File Structure

```
video-player/
├── index.html          # Main HTML file with player structure
├── css/
│   └── styles.css      # All styles including responsive design
├── js/
│   ├── player.js       # Core player logic and state management
│   ├── controls.js     # UI controls and interactions
│   ├── keyboard.js     # Keyboard shortcuts handler
│   └── utils.js        # Utility functions and codec detection
└── README.md           # This file
```

## Customization

### CSS Variables
The player uses CSS custom properties for easy theming:
- `--primary-accent`: Main accent color (default: #3b82f6)
- `--success-accent`: Success color (default: #10b981)
- `--player-bg`: Player background
- `--controls-bg`: Controls background with blur

### Adding Features
The modular architecture makes it easy to extend:
1. Add new methods to the appropriate module
2. Update state in `Player.state` for new features
3. Add UI elements to `index.html`
4. Style new elements in `styles.css`

## Known Limitations

- **PiP**: Picture-in-Picture requires browser support
- **Fullscreen**: Fullscreen API varies by browser
- **Codec Support**: Codec availability depends on browser and OS
- **Local Files**: Some browsers restrict local file access

## License

This project is open source and available under the MIT License.

## Contributing

Contributions are welcome! Please ensure:
- Code follows existing style conventions
- All features are tested across major browsers
- Documentation is updated for new features